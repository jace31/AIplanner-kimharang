/**
 * API 키 없이도 전체 흐름을 체험할 수 있도록 하는 간이(규칙 기반) PRD 분석기.
 * 목록 항목을 기능으로 보고, 키워드로 중요도/복잡도/의존성을 추정한다.
 * 정밀도는 LLM 분석보다 낮으므로 UI에서 "간이 분석"으로 명시한다.
 */
import type { AnalyzedTask, Confidence, Level, PrdAnalysis } from "./types";

/** 복잡도 → 예상 사용량 범위 (한 세션 한도 = 100 기준) */
export const USAGE_BY_COMPLEXITY: Record<Level, [number, number]> = {
  1: [2, 5],
  2: [5, 10],
  3: [10, 18],
  4: [16, 28],
  5: [22, 38],
};

type Kind =
  | "db"
  | "signup"
  | "login"
  | "search"
  | "ai"
  | "notify"
  | "stats"
  | "share"
  | "admin"
  | "payment"
  | "release"
  | "generic";

const RULES: { kind: Kind; pattern: RegExp; importance: Level; complexity: Level }[] = [
  { kind: "db", pattern: /\bdb\b|database|데이터베이스|스키마|schema|데이터\s*모델/i, importance: 5, complexity: 2 },
  { kind: "signup", pattern: /회원\s*가입|sign\s*-?up|\bregister|가입/i, importance: 5, complexity: 2 },
  { kind: "login", pattern: /로그인|\blogin\b|sign\s*-?in|인증|\bauth\b|\boauth\b|소셜/i, importance: 5, complexity: 2 },
  { kind: "payment", pattern: /결제|payment|구독|billing|checkout|stripe/i, importance: 2, complexity: 4 },
  { kind: "ai", pattern: /\bai\b|추천|recommend|llm|gpt|챗봇|chatbot|생성형|요약|분석 엔진/i, importance: 4, complexity: 5 },
  { kind: "search", pattern: /검색|search|필터|filter/i, importance: 4, complexity: 3 },
  { kind: "notify", pattern: /알림|notification|push|푸시|이메일 발송|메일/i, importance: 2, complexity: 3 },
  { kind: "stats", pattern: /통계|대시보드|dashboard|analytics|리포트|report|차트/i, importance: 2, complexity: 3 },
  { kind: "share", pattern: /공유|share|초대|invite/i, importance: 2, complexity: 2 },
  { kind: "admin", pattern: /관리자|admin|백오피스|back\s*office/i, importance: 2, complexity: 4 },
  { kind: "release", pattern: /테스트|\btest(?:ing|s)?\b|배포|\bdeploy|ci\/cd|출시|\brelease\b/i, importance: 3, complexity: 2 },
];

interface Candidate {
  name: string;
  description: string;
}

const BULLET = /^\s*(?:[-*•▪◦]|\d+[.)]|\[[ xX]?\])\s+(.+?)\s*$/;
const HEADING = /^\s*#{2,4}\s+(.+?)\s*$/;
// 기능이 아닌 문서 메타 항목은 제외
const NON_FEATURE = /^(목표|배경|개요|문제|대상|타깃|target|goal|background|overview|기술\s*스택|tech\s*stack|일정|timeline|성공\s*지표|kpi|비기능|non-?functional)/i;

function splitNameDescription(text: string): Candidate {
  const cleaned = text.replace(/\*\*|__|`/g, "").trim();
  const m = cleaned.match(/^(.{2,40}?)\s*(?:[:：]|\s[-–—]\s)\s*(.+)$/);
  if (m) return { name: m[1].trim(), description: m[2].trim() };
  return { name: cleaned.length > 40 ? cleaned.slice(0, 38).trim() + "…" : cleaned, description: cleaned };
}

/**
 * 기능 이름만 보고 종류(login, search, ai …)를 판별한다. 없으면 "generic".
 * 사용량 기록 매칭에 쓰이므로, 설명을 보지 않고 이름만 사용해 기록 시점과 조회 시점의 결과가 항상 같도록 한다.
 */
export function kindOfName(name: string): string {
  return RULES.find((r) => r.pattern.test(name))?.kind ?? "generic";
}

function extractCandidates(prd: string): Candidate[] {
  const lines = prd.split(/\r?\n/);
  let found: Candidate[] = [];

  for (const line of lines) {
    const b = line.match(BULLET);
    if (b) found.push(splitNameDescription(b[1]));
  }
  // 목록이 거의 없으면 소제목을 기능으로 사용
  if (found.length < 3) {
    for (const line of lines) {
      const h = line.match(HEADING);
      if (h) found.push(splitNameDescription(h[1]));
    }
  }
  // 그래도 없으면 짧은 문장 단위로
  if (found.length < 3) {
    found = lines
      .map((l) => l.trim())
      .filter((l) => l.length >= 4 && l.length <= 120 && !l.startsWith("#"))
      .map(splitNameDescription);
  }

  const seen = new Set<string>();
  return found
    .filter((c) => c.name.length >= 2 && !NON_FEATURE.test(c.name))
    .filter((c) => {
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

function classify(c: Candidate): { kind: Kind; importance: Level; complexity: Level } {
  const text = `${c.name} ${c.description}`;
  // 이름에서 먼저 찾고, 없으면 설명까지 본다 (설명에 딸려 나온 키워드에 끌려가는 오분류 방지)
  for (const scope of [c.name, text]) {
    for (const r of RULES) if (r.pattern.test(scope)) return r;
  }
  return { kind: "generic", importance: 3, complexity: 3 };
}

export function heuristicAnalyze(prd: string): PrdAnalysis {
  const firstLine = prd.split(/\r?\n/).find((l) => l.trim())?.replace(/^#+\s*/, "").trim() ?? "";
  const candidates = extractCandidates(prd);

  const drafts = candidates.map((c, i) => ({ c, id: `t${i + 1}`, ...classify(c) }));
  const firstOf = (kind: Kind) => drafts.find((d) => d.kind === kind);

  // 키워드에 걸리지 않는 첫 번째 기능은 서비스의 핵심 도메인 기능으로 본다
  // (PRD에서는 인프라/계정 다음에 핵심 기능이 나오는 경우가 대부분이므로).
  const core = firstOf("generic");
  if (core) core.importance = 5;

  const tasks: AnalyzedTask[] = drafts.map((d) => {
    const deps = new Set<string>();
    const add = (k: Kind) => {
      const t = firstOf(k);
      if (t && t.id !== d.id) deps.add(t.id);
    };
    switch (d.kind) {
      case "signup":
        add("db");
        break;
      case "login":
        add("signup");
        add("db");
        break;
      case "db":
        break;
      case "release":
        // 배포/테스트는 최우선 기능들이 만들어진 뒤에 진행한다
        for (const o of drafts) if (o.id !== d.id && o.importance >= 5) deps.add(o.id);
        break;
      default:
        // 나머지 기능은 사용자 계정(또는 데이터 기반)과 핵심 기능 위에 올라간다
        if (firstOf("login")) add("login");
        else add("db");
        if (core && core.id !== d.id) deps.add(core.id);
    }
    const [usageMin, usageMax] = USAGE_BY_COMPLEXITY[d.complexity];
    const confidence: Confidence = d.kind === "generic" || d.complexity >= 5 ? "low" : "medium";
    return {
      id: d.id,
      name: d.c.name,
      description: d.c.description,
      importance: d.importance,
      complexity: d.complexity,
      usageMin,
      usageMax,
      confidence,
      dependsOn: [...deps],
    };
  });

  return {
    projectName: firstLine.slice(0, 60) || "PRD",
    summary:
      "API 키가 없어 규칙 기반 간이 분석을 사용했습니다. 목록 항목을 기능으로 보고 키워드로 추정한 값이므로, 아래 표에서 중요도와 사용량을 직접 조정해 보세요.",
    tasks,
    source: "heuristic",
  };
}
