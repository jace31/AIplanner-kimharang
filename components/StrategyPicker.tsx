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
  title,
  description,
  preview,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  preview: string;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border-2 p-5 transition ${
        selected
          ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      <p className="mt-3 text-sm font-medium tabular-nums text-slate-800 dark:text-slate-200">{preview}</p>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`mt-4 rounded-lg px-4 py-2 text-sm font-semibold transition ${
          selected
            ? "bg-indigo-600 text-white"
            : "border border-slate-300 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        }`}
      >
        {selected ? "선택됨" : "선택하기"}
      </button>
    </div>
  );
}

export function StrategyPicker({ strategy, onSelect, mvp, phased, taskCount }: Props) {
  return (
    <section>
      <SectionTitle eyebrow="Strategy">개발 전략을 선택하세요</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Option
          selected={strategy === "mvp"}
          onSelect={() => onSelect("mvp")}
          title="MVP 재설계"
          description="현재 사용량 안에서 핵심 기능만 골라 완성도 높은 MVP를 만듭니다."
          preview={`기능 ${mvp.included.length}/${taskCount}개 · 사용량 ${fmt(mvp.usedExpected)} / ${fmt(mvp.budget)}`}
        />
        <Option
          selected={strategy === "phased"}
          onSelect={() => onSelect("phased")}
          title="단계적 개발"
          description="전체 기능을 유지하고 여러 AI 개발 세션에 나눠 완성합니다."
          preview={`${phased.sessions.length}개 세션 · 총 ${fmt(phased.totalExpected)}`}
        />
      </div>
    </section>
  );
}
