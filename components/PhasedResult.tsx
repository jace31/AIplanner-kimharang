import type { PhasedPlan } from "@/lib/types";
import { Card, SectionTitle, UsageBar, fmt } from "./ui";

export function PhasedResult({ plan, taskCount }: { plan: PhasedPlan; taskCount: number }) {
  const n = plan.sessions.length;
  const first = plan.sessions[0];

  return (
    <section className="space-y-5">
      <SectionTitle eyebrow="Option B">단계적 개발 결과</SectionTitle>

      <Card>
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {n === 1
            ? `전체 ${taskCount}개 기능을 한 세션 안에서 완성할 수 있습니다.`
            : `전체 ${taskCount}개 기능을 ${n}개 세션에 나눠 완성합니다.${
                first ? ` 첫 세션이 끝나면 핵심 기능(중요도 기준)의 ${Math.round(first.cumulativeValue * 100)}%를 확보합니다.` : ""
              }`}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          총 예상 사용량 {fmt(plan.totalExpected)} · 첫 세션 {fmt(plan.firstSessionCapacity)}
          {n > 1 && ` · 이후 세션당 ${fmt(plan.sessionCapacity)}`}
        </p>
      </Card>

      <ol className="space-y-4">
        {plan.sessions.map((s, i) => (
          <li key={s.index} className="relative">
            {i < n - 1 && (
              <div
                aria-hidden
                className="absolute left-5 top-full h-4 w-px bg-slate-300 dark:bg-slate-700"
              />
            )}
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                  SESSION {s.index}
                </h3>
                <div className="text-sm tabular-nums text-slate-700 dark:text-slate-300">
                  사용량 {fmt(s.used)} / {fmt(s.capacity)}
                  <span className="ml-3 text-slate-500 dark:text-slate-400">
                    누적 핵심 기능 확보 {Math.round(s.cumulativeValue * 100)}%
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <UsageBar used={s.used} capacity={s.capacity} label={`세션 ${s.index} 사용량`} />
              </div>

              <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {s.items.map((it) => (
                  <li key={`${it.task.id}-${it.part?.index ?? 0}`} className="flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {String(it.order).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {it.task.name}
                          {it.part && (
                            <span className="ml-1.5 text-xs font-normal text-amber-700 dark:text-amber-400">
                              (일부 {it.part.index}/{it.part.total}
                              {it.completes ? " · 완료" : " · 다음 세션에 이어서"})
                            </span>
                          )}
                        </span>
                        <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
                          {fmt(it.allocated)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{it.reason}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
