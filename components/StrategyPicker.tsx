"use client";

import type { MvpPlan, PhasedPlan } from "@/lib/types";
import { SectionTitle, fmt } from "./ui";

export type Strategy = "mvp" | "phased";

interface Props {
  strategy: Strategy | null;
  onSelect: (s: Strategy) => void;
  mvp: MvpPlan;
  phased: PhasedPlan;
  taskCount: number;
}

function Option({
  selected,
  onSelect,
  optionLabel,
  title,
  description,
  big,
  bigUnit,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  optionLabel: string;
  title: string;
  description: string;
  big: string;
  bigUnit: string;
  detail: string;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border-2 p-5 transition ${
        selected ? "border-indigo-600 bg-indigo-50/50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">{optionLabel}</span>
        {selected && (
          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">✓ 선택됨</span>
        )}
      </div>
      <h3 className="mt-1 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-extrabold tabular-nums text-slate-900">{big}</span>
        <span className="text-sm font-semibold text-slate-600">{bigUnit}</span>
      </div>
      <div className="mt-0.5 text-sm tabular-nums text-slate-600">{detail}</div>

      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`mt-4 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
          selected
            ? "border-2 border-indigo-600 bg-white text-indigo-700"
            : "border-2 border-indigo-600 bg-indigo-600 text-white shadow-sm hover:border-indigo-700 hover:bg-indigo-700"
        }`}
      >
        {selected ? "✓ 선택됨" : "선택하기"}
      </button>
    </div>
  );
}

export function StrategyPicker({ strategy, onSelect, mvp, phased, taskCount }: Props) {
  return (
    <section>
      <SectionTitle eyebrow="전략 선택">어떻게 개발할까요?</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Option
          selected={strategy === "mvp"}
          onSelect={() => onSelect("mvp")}
          optionLabel="Option A"
          title="MVP 재설계"
          description="현재 사용량 안에서 핵심 기능만 골라 완성도 높은 MVP를 만듭니다."
          big={`${mvp.included.length}/${taskCount}`}
          bigUnit="개 기능"
          detail={`예상 사용량 ${fmt(mvp.usedExpected)} / 가용 ${fmt(mvp.budget)}`}
        />
        <Option
          selected={strategy === "phased"}
          onSelect={() => onSelect("phased")}
          optionLabel="Option B"
          title="단계적 개발"
          description="전체 기능을 유지하고 여러 AI 개발 세션에 나눠 완성합니다."
          big={String(phased.sessions.length)}
          bigUnit="개 세션"
          detail={`전체 예상 사용량 ${fmt(phased.totalExpected)}`}
        />
      </div>
    </section>
  );
}
