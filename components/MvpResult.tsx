import type { MvpPlan } from "@/lib/types";
import { Card, ConfidenceBadge, ImportanceBadge, SectionTitle, Stat, UsageBar, fmt, usageRange } from "./ui";

function conclusion(mvp: MvpPlan, total: number): string {
  if (mvp.included.length === 0) {
    return "현재 사용량으로는 완성할 수 있는 기능이 없습니다. 사용 가능한 사용량을 늘리거나 기능 범위를 줄여 보세요.";
  }
  if (mvp.excluded.length === 0) {
    return `전체 ${total}개 기능을 모두 현재 사용량 안에서 만들 수 있습니다.`;
  }
  return `${mvp.included.length}개 기능을 MVP로 구성하면 현재 사용량에서 완성할 수 있습니다. 나머지 ${mvp.excluded.length}개는 다음 단계로 미룹니다.`;
}

export function MvpResult({ mvp, total }: { mvp: MvpPlan; total: number }) {
  return (
    <section className="space-y-5">
      <SectionTitle eyebrow="Option A">MVP 재설계 결과</SectionTitle>

      <Card>
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{conclusion(mvp, total)}</p>
        <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="기능 수" value={`${total}개 → ${mvp.included.length}개`} sub="원래 PRD → MVP" />
          <Stat
            label="예상 사용량"
            value={`${fmt(mvp.usedExpected)} / ${fmt(mvp.budget)}`}
            sub={`추정 범위 ${fmt(mvp.usedMin)}~${fmt(mvp.usedMax)}`}
          />
          <Stat label="예상 사용률" value={`${Math.round(mvp.utilization * 100)}%`} />
          <Stat label="핵심 기능 확보" value={`${Math.round(mvp.valueCaptured * 100)}%`} sub="중요도 가중치 기준" />
        </div>
        <div className="mt-4">
          <UsageBar used={mvp.usedExpected} capacity={mvp.budget} label="MVP 예상 사용률" />
        </div>
        {mvp.included.length > 0 && !mvp.fitsWorstCase && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            최대 추정치({fmt(mvp.usedMax)}) 기준으로는 사용 가능한 사용량({fmt(mvp.budget)})을 넘을 수 있습니다. 마지막
            기능은 여유가 있을 때 진행하는 것을 권장합니다.
          </p>
        )}
      </Card>

      {mvp.included.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">이번 MVP에 포함 · 개발 순서</h3>
          <ol className="space-y-2">
            {mvp.included.map((p) => (
              <li
                key={p.task.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {String(p.order).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">✓ {p.task.name}</div>
                      {p.task.description && (
                        <div className="text-sm text-slate-500 dark:text-slate-400">{p.task.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums text-slate-700 dark:text-slate-300">
                    예상 사용량 {usageRange(p.task)}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-10">
                  <ImportanceBadge level={p.task.importance} />
                  <ConfidenceBadge level={p.task.confidence} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{p.reason}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {mvp.excluded.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">다음 단계로 미룸</h3>
          <ul className="space-y-2">
            {mvp.excluded.map((e) => (
              <li
                key={e.task.id}
                className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="font-medium text-slate-700 dark:text-slate-300">○ {e.task.name}</div>
                  <div className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    예상 사용량 {usageRange(e.task)}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <ImportanceBadge level={e.task.importance} />
                  <span className="text-sm text-slate-600 dark:text-slate-400">제외 이유: {e.reason}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
