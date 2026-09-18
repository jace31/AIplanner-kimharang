/**
 * 예상 → 실제 사용량 피드백.
 * 사용자가 기록한 (예상, 실제) 쌍으로 "내 개발 방식에서의 배율"을 학습해,
 * 다음 프로젝트의 AI 예상 사용량을 사용자에 맞게 보정한다. (순수 함수 — 서버/DB/API 키 불필요)
 */
import { kindOfName } from "./heuristic";
import type { AnalyzedTask } from "./types";

export interface UsageRecord {
  id: string;
  project: string;
  taskName: string;
  /** 기능 종류 키 (taskKey). 이름이 달라도 같은 종류의 기능을 매칭하는 데 쓴다. */
  key: string;
  /** 보정 전(원래 AI/기본) 예상 범위 — 배율 계산의 기준. 보정값을 기준으로 삼으면 배율이 중첩된다. */
  estMin: number;
  estMax: number;
  actual: number;
  /** 기록 당시 화면에 보여준(보정 후) 예상 범위 — 참고용 */
  predictedMin?: number;
  predictedMax?: number;
  recordedAt: number;
}

export interface Calibration {
  /** task: 같은 종류 기능의 기록으로 보정 / global: 전체 경향만 약하게 반영 */
  source: "task" | "global";
  /** 근거가 된 기록 수 */
  samples: number;
  ratio: number;
  baseMin: number;
  baseMax: number;
}

const MIN_RATIO = 0.3;
const MAX_RATIO = 4;
/** 전체 경향 배율을 1쪽으로 당기는 사전 표본 수. 기록이 적을수록 전체 경향은 조금만 반영한다. */
const GLOBAL_PRIOR = 3;
/** 오래된 기록일수록 가중치를 낮춘다 (최신 = 1, 그다음 = 0.7, …) */
const RECENCY_DECAY = 0.7;
/** 같은 종류 기록 1건일 때의 범위 반폭(±20%). 기록이 n건이면 /√n 로 좁아지되 MIN~MAX 사이로 제한한다. */
const BASE_HALF_WIDTH = 0.2;
const MIN_HALF_WIDTH = 0.08;
const MAX_HALF_WIDTH = 0.4;

/** 도움말 화면이 계산 규칙의 숫자를 그대로 보여주도록 공개한다 (문서와 코드가 어긋나지 않게) */
export const CALIBRATION_PARAMS = {
  minRatio: MIN_RATIO,
  maxRatio: MAX_RATIO,
  globalPrior: GLOBAL_PRIOR,
  recencyDecay: RECENCY_DECAY,
  baseHalfWidth: BASE_HALF_WIDTH,
  minHalfWidth: MIN_HALF_WIDTH,
  maxHalfWidth: MAX_HALF_WIDTH,
  /** 이 개수 이상이면 신뢰도를 '높음'으로 올린다 */
  highConfidenceSamples: 3,
} as const;

const mid = (min: number, max: number) => (min + max) / 2;
const clampRatio = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

export const normalizeName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** 5 이상은 정수, 그 미만은 0.5 단위로 반올림해 "14~20"처럼 읽기 쉬운 범위로 만든다 */
function niceRound(v: number): number {
  return Math.max(0.5, v >= 5 ? Math.round(v) : Math.round(v * 2) / 2);
}

/** 기능 종류 키: 로그인/login/인증 처럼 알려진 종류는 종류로, 나머지는 정규화한 이름으로 */
export function taskKey(name: string): string {
  const kind = kindOfName(name);
  return kind !== "generic" ? `kind:${kind}` : `name:${normalizeName(name)}`;
}

function keysMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a.startsWith("name:") || !b.startsWith("name:")) return false;
  const x = a.slice(5);
  const y = b.slice(5);
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
}

export function isValidRecord(r: UsageRecord): boolean {
  return (
    r.actual > 0 && r.estMin > 0 && r.estMax >= r.estMin && Number.isFinite(r.actual) && Number.isFinite(r.estMax)
  );
}

/** 실제 ÷ 예상 중앙값 (1.7 = 예상보다 70% 더 씀) */
export function recordRatio(r: UsageRecord): number {
  return clampRatio(r.actual / mid(r.estMin, r.estMax));
}

export function makeRecord(input: {
  project: string;
  taskName: string;
  estMin: number;
  estMax: number;
  actual: number;
  predictedMin?: number;
  predictedMax?: number;
  id?: string;
  recordedAt?: number;
}): UsageRecord {
  const estMin = Math.min(input.estMin, input.estMax);
  const estMax = Math.max(input.estMin, input.estMax);
  return {
    id: input.id ?? `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    project: input.project,
    taskName: input.taskName.trim(),
    key: taskKey(input.taskName),
    estMin,
    estMax,
    actual: input.actual,
    predictedMin: input.predictedMin,
    predictedMax: input.predictedMax,
    recordedAt: input.recordedAt ?? Date.now(),
  };
}

/** 전체 기록의 요약: 개수와 평균 배율(기하평균) */
export function summarizeRecords(records: UsageRecord[]): { count: number; meanRatio: number } {
  const valid = records.filter(isValidRecord);
  if (!valid.length) return { count: 0, meanRatio: 1 };
  const mean = valid.reduce((s, r) => s + Math.log(recordRatio(r)), 0) / valid.length;
  return { count: valid.length, meanRatio: Math.exp(mean) };
}

/**
 * 같은 종류의 기록이 없는 기능에 쓰는 "전체 경향" 배율.
 * 모든 기록 배율의 기하평균을 (기록 수 + GLOBAL_PRIOR)로 나눠 1쪽으로 당기므로, 기록이 적을수록 조금만 반영된다.
 * (예: 기록 1건이 ×1.7이면 1.7^(1/4) ≈ ×1.14)
 */
export function globalRatio(records: UsageRecord[]): number {
  const valid = records.filter(isValidRecord);
  if (!valid.length) return 1;
  return Math.exp(valid.reduce((s, r) => s + Math.log(recordRatio(r)), 0) / (valid.length + GLOBAL_PRIOR));
}

/**
 * Task 목록에 사용자 기록을 반영한 예상 사용량으로 바꾼다. 입력은 변경하지 않는다.
 * - 같은 종류 기록이 있으면: 최근 기록에 가중한 배율을 그대로 적용하고, 기록이 많고 일관될수록 범위를 좁힌다.
 * - 없으면: 전체 경향 배율(사전 표본으로 1쪽으로 당김)을 약하게 적용한다.
 * - skipIds: 사용자가 직접 수정한 Task 등은 보정하지 않는다.
 */
export function calibrateTasks(
  tasks: AnalyzedTask[],
  records: UsageRecord[],
  options: { skipIds?: ReadonlySet<string> } = {},
): { tasks: AnalyzedTask[]; calibrations: Map<string, Calibration> } {
  const valid = records.filter(isValidRecord);
  const calibrations = new Map<string, Calibration>();
  if (!valid.length) return { tasks, calibrations };

  const gRatio = globalRatio(valid);

  const out = tasks.map((t) => {
    if (options.skipIds?.has(t.id)) return t;

    const key = taskKey(t.name);
    const matched = valid.filter((r) => keysMatch(r.key, key)).sort((a, b) => b.recordedAt - a.recordedAt);

    if (matched.length) {
      const weights = matched.map((_, i) => RECENCY_DECAY ** i);
      const wSum = weights.reduce((s, w) => s + w, 0);
      const logs = matched.map((r) => Math.log(recordRatio(r)));
      const mu = logs.reduce((s, l, i) => s + l * weights[i], 0) / wSum;
      const variance = logs.reduce((s, l, i) => s + weights[i] * (l - mu) ** 2, 0) / wSum;
      const n = matched.length;
      // 반폭: 기록 1건이면 ±20%, 많아질수록 좁아지되 기록끼리 들쭉날쭉하면(표준편차) 넓힌다
      const halfWidth = Math.min(
        MAX_HALF_WIDTH,
        Math.max(MIN_HALF_WIDTH, BASE_HALF_WIDTH / Math.sqrt(n), Math.sqrt(variance)),
      );
      const ratio = Math.exp(mu);
      const center = mid(t.usageMin, t.usageMax) * ratio;
      const usageMin = niceRound(center * (1 - halfWidth));
      const usageMax = Math.max(usageMin, niceRound(center * (1 + halfWidth)));
      calibrations.set(t.id, { source: "task", samples: n, ratio, baseMin: t.usageMin, baseMax: t.usageMax });
      return {
        ...t,
        usageMin,
        usageMax,
        confidence: n >= CALIBRATION_PARAMS.highConfidenceSamples ? ("high" as const) : t.confidence === "low" ? ("medium" as const) : t.confidence,
      };
    }

    if (Math.abs(Math.log(gRatio)) >= 0.05) {
      calibrations.set(t.id, {
        source: "global",
        samples: valid.length,
        ratio: gRatio,
        baseMin: t.usageMin,
        baseMax: t.usageMax,
      });
      return { ...t, usageMin: niceRound(t.usageMin * gRatio), usageMax: niceRound(t.usageMax * gRatio) };
    }
    return t;
  });

  return { tasks: out, calibrations };
}

/** 같은 프로젝트·같은 이름의 기록은 덮어쓰고, 나머지는 추가한다 */
export function upsertRecords(existing: UsageRecord[], incoming: UsageRecord[]): UsageRecord[] {
  const id = (r: UsageRecord) => `${r.project}::${normalizeName(r.taskName)}`;
  const replaced = new Set(incoming.map(id));
  return [...existing.filter((r) => !replaced.has(id(r))), ...incoming];
}
