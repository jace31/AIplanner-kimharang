import { heuristicAnalyze } from "@/lib/heuristic";
import { AnalysisError, llmAnalyze, resolveLlm } from "@/lib/llm";

export const maxDuration = 120;

const MAX_PRD_CHARS = 30_000;
const MIN_PRD_CHARS = 20;

/** 현재 분석 모드를 알려준다 (UI 안내용). 키 값은 절대 노출하지 않는다. */
export async function GET() {
  const info = resolveLlm();
  return Response.json({
    mode: info.provider ? "llm" : "heuristic",
    provider: info.provider,
    model: info.model,
    problem: info.problem ?? null,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const prd = typeof (body as { prd?: unknown })?.prd === "string" ? (body as { prd: string }).prd.trim() : "";
  if (prd.length < MIN_PRD_CHARS) {
    return Response.json({ error: "PRD 내용을 조금 더 자세히 입력해 주세요." }, { status: 400 });
  }
  if (prd.length > MAX_PRD_CHARS) {
    return Response.json(
      { error: `PRD가 너무 깁니다. ${MAX_PRD_CHARS.toLocaleString()}자 이하로 줄여 주세요.` },
      { status: 413 },
    );
  }

  try {
    const info = resolveLlm();
    const analysis = info.provider ? await llmAnalyze(prd, info) : heuristicAnalyze(prd);
    if (!analysis.tasks.length) {
      return Response.json(
        { error: "PRD에서 기능 목록을 찾지 못했습니다. 기능을 목록(- 항목)으로 적어 보세요." },
        { status: 422 },
      );
    }
    return Response.json(analysis);
  } catch (error) {
    if (error instanceof AnalysisError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("analyze failed", error);
    return Response.json({ error: "분석 중 알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
