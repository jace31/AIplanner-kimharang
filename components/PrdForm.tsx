"use client";

import { Card } from "./ui";

export interface AnalyzeMode {
  mode: "llm" | "heuristic";
  provider: "gemini" | "anthropic" | null;
  model: string | null;
  /** 설정이 어긋난 경우의 안내 */
  problem?: string | null;
}

export const PROVIDER_LABEL = { gemini: "Gemini", anthropic: "Claude" } as const;

interface Props {
  prd: string;
  onPrd: (v: string) => void;
  budgetText: string;
  onBudget: (v: string) => void;
  capacityText: string;
  onCapacity: (v: string) => void;
  onSample: () => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  mode: AnalyzeMode | null;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function PrdForm({
  prd,
  onPrd,
  budgetText,
  onBudget,
  capacityText,
  onCapacity,
  onSample,
  onSubmit,
  loading,
  error,
  mode,
}: Props) {
  const budget = Number(budgetText);
  const budgetInvalid = budgetText !== "" && !(budget > 0);
  const canSubmit = prd.trim().length >= 20 && budget > 0 && !loading;

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit();
        }}
        className="space-y-5"
      >
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="prd" className="text-sm font-medium text-slate-900 dark:text-slate-100">
              PRD
            </label>
            <button
              type="button"
              onClick={onSample}
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              샘플 PRD 불러오기
            </button>
          </div>
          <textarea
            id="prd"
            value={prd}
            onChange={(e) => onPrd(e.target.value)}
            rows={11}
            placeholder={"이미 작성된 PRD를 붙여넣으세요.\n기능은 '- 로그인: 이메일 로그인' 처럼 목록으로 적으면 더 잘 분석됩니다."}
            className={`${inputCls} resize-y font-mono leading-relaxed`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="budget" className="mb-1.5 block text-sm font-medium text-slate-900 dark:text-slate-100">
              현재 사용 가능한 AI 개발 사용량
            </label>
            <input
              id="budget"
              inputMode="decimal"
              value={budgetText}
              onChange={(e) => onBudget(e.target.value)}
              aria-invalid={budgetInvalid}
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              한 번의 사용 한도 전체를 100으로 봅니다. 예: Claude Code 5시간 세션이 절반 남았다면 50
            </p>
            {budgetInvalid && <p className="mt-1 text-xs text-rose-600">0보다 큰 숫자를 입력해 주세요.</p>}
          </div>
          <div>
            <label htmlFor="capacity" className="mb-1.5 block text-sm font-medium text-slate-900 dark:text-slate-100">
              다음 세션부터의 세션당 사용량 <span className="font-normal text-slate-500">(선택)</span>
            </label>
            <input
              id="capacity"
              inputMode="decimal"
              value={capacityText}
              onChange={(e) => onCapacity(e.target.value)}
              placeholder={budgetText || "위 값과 동일"}
              className={inputCls}
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              단계적 개발에서 2번째 세션부터 쓸 수 있는 양. 비우면 위 값과 같다고 가정합니다.
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">
            {error}
          </div>
        )}

        {mode?.provider === "gemini" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Gemini 무료 티어는 Google 약관상 입력한 내용이 제품 개선에 사용될 수 있습니다. 기밀·개인정보가 담긴 PRD는
            넣지 마세요.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode?.mode === "llm" && mode.provider ? (
              <>
                {PROVIDER_LABEL[mode.provider]}가 PRD를 분석합니다 ({mode.model})
              </>
            ) : mode ? (
              <>
                {mode.problem ? <span className="text-amber-700 dark:text-amber-400">{mode.problem} </span> : null}
                간이 분석 모드 — 서버에{" "}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">GEMINI_API_KEY</code>(또는{" "}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">ANTHROPIC_API_KEY</code>)를 설정하면 LLM이
                분석합니다
              </>
            ) : (
              " "
            )}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "분석 중…" : "분석하기"}
          </button>
        </div>
      </form>
    </Card>
  );
}
