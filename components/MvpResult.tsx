import type { MvpPlan } from "@/lib/types";
import { Card, ConfidenceBadge, ImportanceBadge, SectionTitle, UsageBar, fmt, usageRange } from "./ui";

function conclusion(mvp: MvpPlan, total: number): string {
  if (mvp.included.length === 0) {
    return "현재 사용량으로는 완성할 수 있는 기능이 없습니다. 사용 가능한 사용량을 늘리거나 기능 범위를 줄여 보세요.";
  }
  if (mvp.excluded.length === 0) {
    return `전체 ${total}개 기능을 모두 현재 사용량 안에서 만들 수 있습니다.`;
  }
  return `${mvp.included.length}개 기능을 MVP로 구성하면 현재 사용량에서 완성할 수 있습니다. 나머지 ${mvp.excluded.length}개는 다음 단계로 미룹니다.`;
}

function Kpi({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tabular-nums text-slate-900">{value}</span>
        {unit && <span className="text-sm font-semibold text-slate-600">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function MvpResult({ mvp, total }: { mvp: MvpPlan; total: number }) {
  return (
    <section className="space-y-5">
      <SectionTitle eyebrow="Option A · 결과">MVP 재설계 결과</SectionTitle>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
        <p className="text-lg font-bold text-indigo-950">{conclusion(mvp, total)}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="MVP 기능 수" value={String(mvp.included.length)} unit={`/ ${total}개`} sub="원래 PRD 기능 중" />
          <Kpi
            label="예상 사용량"
            value={`${fmt(mvp.usedExpected)}`}
            unit={`/ ${fmt(mvp.budget)}`}
            sub={`추정 범위 ${fmt(mvp.usedMin)}~${fmt(mvp.usedMax)}`}
          />
          <Kpi label="예상 사용률" value={`${Math.round(mvp.utilization * 100)}`} unit="%" sub="가용 사용량 대비" />
          <Kpi label="핵심 기능 확보" value={`${Math.round(mvp.valueCaptured * 100)}`} unit="%" sub="중요도 가중치 기준" />
        </div>

        <div className="mt-4">
          <UsageBar used={mvp.usedExpected} capacity={mvp.budget} label="MVP 예상 사용률" />
        </div>

        {mvp.included.length > 0 && !mvp.fitsWorstCase && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            최대 추정치({fmt(mvp.usedMax)}) 기준으로는 사용 가능한 사용량({fmt(mvp.budget)})을 넘을 수 있습니다. 마지막
            기능은 여유가 있을 때 진행하는 것을 권장합니다.
          </p>
        )}
      </div>

      {mvp.included.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-900">
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800">포함</span>
            이번 MVP에 포함 · 개발 순서
          </h3>
          <ol className="space-y-2.5">
            {mvp.included.map((p) => (
              <li key={p.task.id}>
                <Card className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                      {String(p.order).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-slate-900">{p.task.name}</div>
                      {p.task.description && <div className="text-sm text-slate-700">{p.task.description}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-semibold text-slate-500">예상 사용량</div>
                      <div className="text-2xl font-extrabold tabular-nums text-slate-900">{usageRange(p.task)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-11">
                    <ImportanceBadge level={p.task.importance} />
                    <ConfidenceBadge level={p.task.confidence} />
                  </div>
                  <p className="mt-2 pl-11 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">순서 이유 </span>
                    {p.reason}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      )}

      {mvp.excluded.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-slate-900">
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-bold text-slate-700">보류</span>
            다음 단계로 미룸
          </h3>
          <ul className="space-y-2.5">
            {mvp.excluded.map((e) => (
              <li key={e.task.id} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-sm font-bold text-slate-400">
                    ○
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold text-slate-800">{e.task.name}</div>
                    {e.task.description && <div className="text-sm text-slate-700">{e.task.description}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] font-semibold text-slate-500">예상 사용량</div>
                    <div className="text-2xl font-extrabold tabular-nums text-slate-700">{usageRange(e.task)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-11">
                  <ImportanceBadge level={e.task.importance} />
                </div>
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                  <span className="font-bold">제외 이유 </span>
                  {e.reason}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
