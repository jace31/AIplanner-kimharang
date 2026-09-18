import type { PhasedPlan } from "@/lib/types";
import { Card, SectionTitle, UsageBar, fmt } from "./ui";

export function PhasedResult({ plan, taskCount }: { plan: PhasedPlan; taskCount: number }) {
  const n = plan.sessions.length;
  const first = plan.sessions[0];

  return (
    <section className="space-y-5">
      <SectionTitle eyebrow="Option B · 결과">단계적 개발 결과</SectionTitle>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
        <p className="text-lg font-bold text-indigo-950">
          {n === 1
            ? `전체 ${taskCount}개 기능을 한 세션 안에서 완성할 수 있습니다.`
            : `전체 ${taskCount}개 기능을 ${n}개 세션에 나눠 완성합니다.${
                first ? ` 첫 세션이 끝나면 핵심 기능(중요도 기준)의 ${Math.round(first.cumulativeValue * 100)}%를 확보합니다.` : ""
              }`}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">세션 수</div>
            <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">
              {n}
              <span className="ml-1 text-sm font-semibold text-slate-600">개</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">전체 예상 사용량</div>
            <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">{fmt(plan.totalExpected)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">세션당 사용량</div>
            <div className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">{fmt(plan.sessionCapacity)}</div>
            {plan.firstSessionCapacity !== plan.sessionCapacity && (
              <div className="mt-0.5 text-xs text-slate-500">첫 세션 {fmt(plan.firstSessionCapacity)}</div>
            )}
          </div>
        </div>
      </div>

      <ol className="space-y-4">
        {plan.sessions.map((s, i) => (
          <li key={s.index} className="relative">
            {i < n - 1 && <div aria-hidden className="absolute left-6 top-full h-4 w-0.5 bg-slate-300" />}
            <Card className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
                <h3 className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-bold tracking-wider text-white">
                  SESSION {s.index}
                </h3>
                <div className="flex items-baseline gap-4">
                  <span className="text-sm font-semibold text-emerald-700">
                    누적 핵심 기능 확보 {Math.round(s.cumulativeValue * 100)}%
                  </span>
                  <span className="text-slate-500">
                    <span className="text-2xl font-extrabold tabular-nums text-slate-900">{fmt(s.used)}</span>
                    <span className="text-base font-semibold tabular-nums"> / {fmt(s.capacity)}</span>
                    <span className="ml-1 text-xs">사용량</span>
                  </span>
                </div>
              </div>
              <div className="px-5 pt-3">
                <UsageBar used={s.used} capacity={s.capacity} label={`세션 ${s.index} 사용량`} />
              </div>

              <ul className="divide-y divide-slate-100 px-5 pb-2 pt-1">
                {s.items.map((it) => (
                  <li key={`${it.task.id}-${it.part?.index ?? 0}`} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                      {String(it.order).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-slate-900">
                        {it.task.name}
                        {it.part && (
                          <span className="ml-1.5 text-xs font-semibold text-amber-700">
                            (일부 {it.part.index}/{it.part.total}
                            {it.completes ? " · 완료" : " · 다음 세션에 이어서"})
                          </span>
                        )}
                      </div>
                      {it.task.description && <div className="text-sm text-slate-700">{it.task.description}</div>}
                      <div className="mt-1 text-xs text-slate-600">{it.reason}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-semibold text-slate-500">배정 사용량</div>
                      <div className="text-xl font-extrabold tabular-nums text-slate-900">{fmt(it.allocated)}</div>
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
