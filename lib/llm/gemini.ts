/**
 * 서버 전용: Google AI Studio(Gemini API) 분석기. 추가 의존성 없이 REST(generateContent)를 fetch로 호출한다.
 * API 키는 URL이 아니라 x-goog-api-key 헤더로만 보내고, 오류 메시지·로그에 포함하지 않는다.
 */
import type { PrdAnalysis } from "../types";
import { AnalysisError, SYSTEM_PROMPT, TASK_SCHEMA, normalizeAnalysis, parseJsonText, wrapPrd } from "./shared";

/** 공식 문서(models 페이지)가 구조화 출력 작업에 권장하고 무료 티어를 제공한다고 안내하는 모델 */
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
/** 라우트의 maxDuration(120초) 안에 끝나도록 전체 예산과 1회 시도 상한을 둔다 */
const TOTAL_BUDGET_MS = 105_000;
const ATTEMPT_TIMEOUT_MS = 80_000;
/** 무료 티어의 일시적 과부하(503 등)에 대한 재시도 간격 */
const DEFAULT_RETRY_DELAYS_MS = [2_000, 5_000];
const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Gemini 키 환경변수. 공식 SDK들이 쓰는 이름(GEMINI_API_KEY, GOOGLE_API_KEY)과
 * Vercel AI SDK가 쓰는 이름(GOOGLE_GENERATIVE_AI_API_KEY)을 모두 인식한다.
 */
export const geminiApiKey = (env: NodeJS.ProcessEnv = process.env) =>
  env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || "";
export const geminiModel = (env: NodeJS.ProcessEnv = process.env) =>
  (env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL).replace(/^models\//, "");

interface GeminiPart {
  text?: string;
  /** thinking 요약 파트. 결과 JSON이 아니므로 제외한다. */
  thought?: boolean;
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] };
}

export interface GeminiOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** 일시적 서버 오류 재시도 간격 (테스트에서 0으로 줄일 때 사용) */
  retryDelaysMs?: number[];
}

function httpError(status: number, body: GeminiResponse | null, model: string): AnalysisError {
  const message = body?.error?.message ?? "";
  const reason = body?.error?.details?.find((d) => d.reason)?.reason;

  // 잘못된 키는 401/403이 아니라 400 + API_KEY_INVALID로 온다
  if (reason === "API_KEY_INVALID" || /api key (not valid|expired)/i.test(message)) {
    return new AnalysisError("Gemini API 키가 올바르지 않습니다. GEMINI_API_KEY를 확인해 주세요.", 500);
  }
  if (status === 401 || status === 403) {
    return new AnalysisError(
      `Gemini API 접근이 거부되었습니다. 키의 권한/제한 설정을 확인해 주세요.${message ? ` (${message})` : ""}`,
      500,
    );
  }
  if (status === 404) {
    return new AnalysisError(`모델 "${model}"을(를) 찾을 수 없습니다. GEMINI_MODEL 값을 확인해 주세요.`, 500);
  }
  if (status === 429) {
    return new AnalysisError(
      "Gemini 무료 사용 한도(분당·일일 요청 수 또는 토큰)에 도달했습니다. 잠시 후 다시 시도해 주세요.",
      429,
    );
  }
  if (status === 400) {
    return new AnalysisError(`분석 요청이 거부되었습니다${message ? `: ${message}` : "."}`, 400);
  }
  if (status === 503) {
    return new AnalysisError(
      `Gemini 모델(${model})이 일시적으로 혼잡합니다(무료 티어에서 자주 발생). 잠시 후 다시 시도하거나 GEMINI_MODEL을 다른 모델로 바꿔 보세요.`,
      503,
    );
  }
  return new AnalysisError(`Gemini API 오류 (${status})${message ? `: ${message}` : ""}`);
}

export async function geminiAnalyze(prd: string, options: GeminiOptions = {}): Promise<PrdAnalysis> {
  const env = options.env ?? process.env;
  const doFetch = options.fetchImpl ?? fetch;
  const apiKey = geminiApiKey(env);
  if (!apiKey) throw new AnalysisError("GEMINI_API_KEY가 설정되지 않았습니다.", 500);
  const model = geminiModel(env);

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: wrapPrd(prd) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: TASK_SCHEMA,
      maxOutputTokens: 16000,
    },
  });
  const url = `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: requestBody,
        signal: AbortSignal.timeout(Math.max(1_000, Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now()))),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new AnalysisError(
        timedOut
          ? "Gemini 응답이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요."
          : "Gemini API에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.",
      );
    }
    // 일시적 서버 오류(과부하 등)는 남은 시간이 충분할 때만 잠깐 기다렸다가 다시 시도한다
    const delay = delays[attempt];
    if (TRANSIENT_STATUS.has(res.status) && delay !== undefined && deadline - Date.now() > delay + 20_000) {
      await res.arrayBuffer().catch(() => undefined);
      await sleep(delay);
      continue;
    }
    break;
  }

  const body = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (!res.ok) throw httpError(res.status, body, model);
  if (!body) throw new AnalysisError("Gemini 응답을 해석하지 못했습니다.");

  if (body.promptFeedback?.blockReason) {
    throw new AnalysisError(`Gemini가 이 PRD를 처리하지 않았습니다 (${body.promptFeedback.blockReason}). 내용을 확인해 주세요.`, 422);
  }
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new AnalysisError("분석 결과가 너무 길어 중단되었습니다. PRD를 나눠서 시도해 주세요.", 422);
  }
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new AnalysisError(`Gemini가 응답을 중단했습니다 (${candidate.finishReason}). 내용을 확인해 주세요.`, 422);
  }

  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text) throw new AnalysisError("모델이 분석 결과를 반환하지 않았습니다.");
  return normalizeAnalysis(parseJsonText(text), "gemini", model);
}
