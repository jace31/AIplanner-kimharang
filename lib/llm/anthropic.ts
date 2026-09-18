/** 서버 전용: Claude API 분석기 */
import Anthropic from "@anthropic-ai/sdk";
import type { PrdAnalysis } from "../types";
import { AnalysisError, SYSTEM_PROMPT, TASK_SCHEMA, normalizeAnalysis, parseJsonText, wrapPrd } from "./shared";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";

export const anthropicModel = (env: NodeJS.ProcessEnv = process.env) => env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL;

export async function anthropicAnalyze(prd: string): Promise<PrdAnalysis> {
  const client = new Anthropic();
  const model = anthropicModel();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: TASK_SCHEMA } },
      messages: [{ role: "user", content: wrapPrd(prd) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AnalysisError("API 키가 올바르지 않습니다. ANTHROPIC_API_KEY를 확인해 주세요.", 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnalysisError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new AnalysisError(`분석 요청이 거부되었습니다: ${error.message}`, 400);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AnalysisError(`Claude API 오류 (${error.status ?? "network"}): ${error.message}`);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("모델이 이 PRD의 분석을 거절했습니다. 내용을 확인해 주세요.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new AnalysisError("분석 결과가 너무 길어 중단되었습니다. PRD를 나눠서 시도해 주세요.", 422);
  }

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new AnalysisError("모델이 분석 결과를 반환하지 않았습니다.");
  return normalizeAnalysis(parseJsonText(text), "anthropic", model);
}
