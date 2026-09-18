import { describe, expect, it } from "vitest";
import { GEMINI_DEFAULT_MODEL, geminiAnalyze } from "./gemini";
import { resolveLlm } from "./index";
import { AnalysisError, normalizeAnalysis } from "./shared";

const KEY = "AIza-secret-test-key-123";
const env = (extra: Record<string, string> = {}) => ({ GEMINI_API_KEY: KEY, ...extra }) as unknown as NodeJS.ProcessEnv;

const analysisJson = {
  projectName: "스터디메이트",
  summary: "스터디 매칭 서비스",
  tasks: [
    {
      id: "t1",
      name: "DB 설계",
      description: "스키마",
      importance: 5,
      complexity: 2,
      usageMin: 5,
      usageMax: 10,
      confidence: "medium",
      dependsOn: [],
    },
    {
      id: "t2",
      name: "로그인",
      description: "이메일 로그인",
      importance: 5,
      complexity: 2,
      usageMin: 8,
      usageMax: 12,
      confidence: "high",
      dependsOn: ["t1"],
    },
  ],
};

const okBody = (text: string, extraParts: object[] = []) => ({
  candidates: [{ content: { parts: [...extraParts, { text }] }, finishReason: "STOP" }],
});

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const run = (m: { impl: typeof fetch }, e = env()) =>
  geminiAnalyze("PRD 본문입니다. 로그인과 검색 기능이 필요합니다.", { env: e, fetchImpl: m.impl, retryDelaysMs: [0, 0] });

describe("geminiAnalyze — 요청", () => {
  it("generateContent에 구조화 출력 설정을 보내고, 키는 URL이 아닌 헤더로만 보낸다", async () => {
    const m = mockFetch(200, okBody(JSON.stringify(analysisJson)));
    await run(m);
    const { url, init } = m.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent`);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.required).toContain("tasks");
    expect(body.systemInstruction.parts[0].text).toContain("untrusted data");
    // PRD는 태그로 감싸 데이터로 전달한다
    expect(body.contents[0].parts[0].text).toMatch(/^<prd>\n[\s\S]*\n<\/prd>$/);
  });

  it("GEMINI_MODEL과 'models/' 접두사를 처리한다", async () => {
    const m = mockFetch(200, okBody(JSON.stringify(analysisJson)));
    const r = await run(m, env({ GEMINI_MODEL: "models/gemini-custom" }));
    expect(m.calls[0].url).toContain("/models/gemini-custom:generateContent");
    expect(r.model).toBe("gemini-custom");
  });

  it("GOOGLE_API_KEY도 키로 인정한다", async () => {
    const m = mockFetch(200, okBody(JSON.stringify(analysisJson)));
    await geminiAnalyze("PRD 본문입니다. 로그인 기능이 필요합니다.", {
      env: { GOOGLE_API_KEY: "g-key" } as unknown as NodeJS.ProcessEnv,
      fetchImpl: m.impl,
    });
    expect((m.calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
  });

  it("키가 없으면 요청 없이 오류", async () => {
    const m = mockFetch(200, {});
    await expect(geminiAnalyze("PRD 본문입니다.", { env: {} as NodeJS.ProcessEnv, fetchImpl: m.impl })).rejects.toThrow(
      /GEMINI_API_KEY/,
    );
    expect(m.calls).toHaveLength(0);
  });
});

describe("geminiAnalyze — 응답", () => {
  it("정상 응답을 PrdAnalysis로 변환하고 thought 파트는 무시한다", async () => {
    const m = mockFetch(200, okBody(JSON.stringify(analysisJson), [{ thought: true, text: "생각 중… {not json}" }]));
    const r = await run(m);
    expect(r.source).toBe("llm");
    expect(r.provider).toBe("gemini");
    expect(r.model).toBe(GEMINI_DEFAULT_MODEL);
    expect(r.tasks).toHaveLength(2);
    expect(r.tasks[1].dependsOn).toEqual(["t1"]);
  });

  it("코드펜스가 붙어 와도 파싱한다", async () => {
    const m = mockFetch(200, okBody("```json\n" + JSON.stringify(analysisJson) + "\n```"));
    expect((await run(m)).tasks).toHaveLength(2);
  });

  it("여러 텍스트 파트는 이어 붙인다", async () => {
    const text = JSON.stringify(analysisJson);
    const m = mockFetch(200, {
      candidates: [{ content: { parts: [{ text: text.slice(0, 40) }, { text: text.slice(40) }] }, finishReason: "STOP" }],
    });
    expect((await run(m)).tasks).toHaveLength(2);
  });

  it("JSON이 아닌 응답은 오류", async () => {
    await expect(run(mockFetch(200, okBody("죄송하지만 분석할 수 없습니다")))).rejects.toThrow(/해석하지 못했/);
  });

  it("빈 응답은 오류", async () => {
    await expect(run(mockFetch(200, { candidates: [] }))).rejects.toThrow(/반환하지 않았/);
  });

  it("프롬프트가 차단되면 422", async () => {
    const err = await run(mockFetch(200, { promptFeedback: { blockReason: "SAFETY" } })).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    expect(err.status).toBe(422);
    expect(err.message).toContain("SAFETY");
  });

  it("MAX_TOKENS로 잘리면 422", async () => {
    const m = mockFetch(200, { candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }] });
    const err = await run(m).catch((e) => e);
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/너무 길어/);
  });

  it("STOP이 아닌 종료 사유(SAFETY 등)는 422", async () => {
    const m = mockFetch(200, { candidates: [{ finishReason: "SAFETY" }] });
    expect((await run(m).catch((e) => e)).status).toBe(422);
  });
});

describe("geminiAnalyze — HTTP 오류", () => {
  it("잘못된 키(400 + API_KEY_INVALID)를 키 오류로 안내하고 키 값을 노출하지 않는다", async () => {
    const m = mockFetch(400, {
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        status: "INVALID_ARGUMENT",
        details: [{ reason: "API_KEY_INVALID" }],
      },
    });
    const err = await run(m).catch((e) => e);
    expect(err.status).toBe(500);
    expect(err.message).toContain("GEMINI_API_KEY");
    expect(err.message).not.toContain(KEY);
  });

  it("429는 무료 한도 안내와 함께 429로 전달", async () => {
    const err = await run(mockFetch(429, { error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } })).catch((e) => e);
    expect(err.status).toBe(429);
    expect(err.message).toContain("무료");
  });

  it("404는 모델명 확인 안내", async () => {
    const err = await run(mockFetch(404, { error: { code: 404, message: "not found" } })).catch((e) => e);
    expect(err.message).toContain(GEMINI_DEFAULT_MODEL);
    expect(err.message).toContain("GEMINI_MODEL");
  });

  it("403은 권한 안내", async () => {
    const err = await run(mockFetch(403, { error: { code: 403, message: "denied" } })).catch((e) => e);
    expect(err.message).toContain("접근이 거부");
  });

  it("일반 400은 Google의 메시지를 그대로 전달", async () => {
    const err = await run(mockFetch(400, { error: { code: 400, message: "Invalid JSON payload" } })).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.message).toContain("Invalid JSON payload");
  });

  it("5xx와 본문이 JSON이 아닌 응답도 처리한다", async () => {
    const impl = (async () => new Response("<html>Bad gateway</html>", { status: 502 })) as typeof fetch;
    const err = await run({ impl }).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    expect(err.message).toContain("502");
  });

  it("네트워크 오류·타임아웃은 AnalysisError", async () => {
    const net = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect((await run({ impl: net }).catch((e) => e)).message).toContain("연결하지 못했");

    const timeout = (async () => {
      throw Object.assign(new Error("t"), { name: "TimeoutError" });
    }) as typeof fetch;
    expect((await run({ impl: timeout }).catch((e) => e)).message).toContain("오래 걸립니다");
  });
});

describe("geminiAnalyze — 일시적 오류 재시도", () => {
  const busy = { error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } };

  function mockSequence(steps: { status: number; body: unknown }[]) {
    let i = 0;
    const calls: string[] = [];
    const impl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      const step = steps[Math.min(i++, steps.length - 1)];
      return new Response(JSON.stringify(step.body), { status: step.status });
    }) as typeof fetch;
    return { impl, calls };
  }
  const go = (m: { impl: typeof fetch }) =>
    geminiAnalyze("PRD 본문입니다. 로그인 기능이 필요합니다.", { env: env(), fetchImpl: m.impl, retryDelaysMs: [0, 0] });

  it("503 후 성공하면 재시도로 결과를 돌려준다", async () => {
    const m = mockSequence([
      { status: 503, body: busy },
      { status: 200, body: okBody(JSON.stringify(analysisJson)) },
    ]);
    expect((await go(m)).tasks).toHaveLength(2);
    expect(m.calls).toHaveLength(2);
  });

  it("계속 503이면 최초 1회 + 재시도 2회 후 혼잡 안내와 함께 503", async () => {
    const m = mockSequence([{ status: 503, body: busy }]);
    const err = await go(m).catch((e) => e);
    expect(m.calls).toHaveLength(3);
    expect(err.status).toBe(503);
    expect(err.message).toContain("혼잡");
    expect(err.message).toContain("GEMINI_MODEL");
  });

  it("400/404/429 같은 비일시적 오류는 재시도하지 않는다", async () => {
    for (const status of [400, 404, 429]) {
      const m = mockSequence([{ status, body: { error: { code: status, message: "x" } } }]);
      await go(m).catch(() => undefined);
      expect(m.calls, `status ${status}`).toHaveLength(1);
    }
  });
});

describe("normalizeAnalysis", () => {
  it("범위를 벗어나거나 빠진 값을 보정한다", () => {
    const r = normalizeAnalysis(
      {
        projectName: "X",
        summary: "",
        tasks: [
          { id: "a", name: "A", importance: 9, complexity: 0, usageMin: 20, usageMax: 10, confidence: "??", dependsOn: ["b", 3] },
          { name: "B" },
          { id: "a", name: "A2" },
        ],
      },
      "gemini",
      "m",
    );
    const [a, b, a2] = r.tasks;
    expect(a.importance).toBe(5);
    expect(a.complexity).toBe(1);
    expect([a.usageMin, a.usageMax]).toEqual([10, 20]);
    expect(a.confidence).toBe("medium");
    expect(a.dependsOn).toEqual(["b"]);
    expect(b.id).toBe("t2");
    expect(b.usageMin).toBeGreaterThan(0);
    expect(new Set([a.id, b.id, a2.id]).size).toBe(3); // 중복 id 해소
  });

  it("Task가 없으면 오류", () => {
    expect(() => normalizeAnalysis({ tasks: [] }, "gemini", "m")).toThrow(/추출하지 못했/);
    expect(() => normalizeAnalysis(null, "gemini", "m")).toThrow();
  });
});

describe("resolveLlm", () => {
  const e = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

  it("키가 없으면 provider 없음(간이 분석)", () => {
    expect(resolveLlm(e({}))).toEqual({ provider: null, model: null });
  });
  it("Gemini 키만 있으면 Gemini, 기본 모델", () => {
    expect(resolveLlm(e({ GEMINI_API_KEY: "k" }))).toEqual({ provider: "gemini", model: GEMINI_DEFAULT_MODEL });
  });
  it("Anthropic 키만 있으면 Claude", () => {
    expect(resolveLlm(e({ ANTHROPIC_API_KEY: "k" })).provider).toBe("anthropic");
  });
  it("둘 다 있으면 무료 티어가 있는 Gemini를 우선한다", () => {
    expect(resolveLlm(e({ GEMINI_API_KEY: "k", ANTHROPIC_API_KEY: "k" })).provider).toBe("gemini");
  });
  it("LLM_PROVIDER로 명시하면 그 provider", () => {
    expect(resolveLlm(e({ GEMINI_API_KEY: "k", ANTHROPIC_API_KEY: "k", LLM_PROVIDER: "anthropic" })).provider).toBe(
      "anthropic",
    );
  });
  it("명시한 provider의 키가 없으면 조용히 다른 provider로 넘어가지 않고 안내한다", () => {
    const r = resolveLlm(e({ ANTHROPIC_API_KEY: "k", LLM_PROVIDER: "gemini" }));
    expect(r.provider).toBeNull();
    expect(r.problem).toContain("GEMINI_API_KEY");
  });
  it("알 수 없는 LLM_PROVIDER 값은 안내", () => {
    expect(resolveLlm(e({ GEMINI_API_KEY: "k", LLM_PROVIDER: "gpt" })).problem).toContain("gpt");
  });
  it("API 키 값은 결과에 포함되지 않는다", () => {
    expect(JSON.stringify(resolveLlm(e({ GEMINI_API_KEY: "SECRET" })))).not.toContain("SECRET");
  });
});
