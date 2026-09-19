/**
 * LLM provider 선택.
 *  1) LLM_PROVIDER=gemini|anthropic 로 명시하면 그 provider
 *  2) 아니면 GEMINI_API_KEY(또는 GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY)가 있으면 Gemini,
 *     없고 ANTHROPIC_API_KEY가 있으면 Claude
 *     (둘 다 있으면 예상치 못한 유료 과금을 피하기 위해 무료 티어가 있는 Gemini를 우선한다)
 *  3) 키가 없으면 null → 규칙 기반 간이 분석
 */
import type { PrdAnalysis } from "../types";
import { ANTHROPIC_DEFAULT_MODEL, anthropicAnalyze, anthropicModel } from "./anthropic";
import { geminiAnalyze, geminiApiKey, geminiModel } from "./gemini";
import type { Provider } from "./shared";

export { AnalysisError } from "./shared";
export type { Provider } from "./shared";

export interface LlmInfo {
  provider: Provider | null;
  model: string | null;
  /** 설정이 어긋난 경우의 안내 (예: LLM_PROVIDER는 gemini인데 키가 없음) */
  problem?: string;
}

export function resolveLlm(env: NodeJS.ProcessEnv = process.env): LlmInfo {
  const forced = env.LLM_PROVIDER?.trim().toLowerCase();
  const hasGemini = Boolean(geminiApiKey(env));
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);

  if (forced === "gemini") {
    return hasGemini
      ? { provider: "gemini", model: geminiModel(env) }
      : { provider: null, model: null, problem: "LLM_PROVIDER=gemini 이지만 GEMINI_API_KEY가 설정되지 않았습니다." };
  }
  if (forced === "anthropic" || forced === "claude") {
    return hasAnthropic
      ? { provider: "anthropic", model: anthropicModel(env) }
      : { provider: null, model: null, problem: "LLM_PROVIDER=anthropic 이지만 ANTHROPIC_API_KEY가 설정되지 않았습니다." };
  }
  if (forced) {
    return { provider: null, model: null, problem: `알 수 없는 LLM_PROVIDER 값입니다: "${forced}" (gemini 또는 anthropic)` };
  }
  if (hasGemini) return { provider: "gemini", model: geminiModel(env) };
  if (hasAnthropic) return { provider: "anthropic", model: anthropicModel(env) };
  return { provider: null, model: null };
}

export async function llmAnalyze(prd: string, info: LlmInfo = resolveLlm()): Promise<PrdAnalysis> {
  if (info.provider === "gemini") return geminiAnalyze(prd);
  if (info.provider === "anthropic") return anthropicAnalyze(prd);
  throw new Error("LLM provider가 설정되지 않았습니다.");
}

export { ANTHROPIC_DEFAULT_MODEL };
