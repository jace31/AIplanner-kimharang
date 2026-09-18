"use client";

import type { UsageAssessment, UsageStatus } from "@/lib/types";
import { Badge, Card, SectionTitle, Stat, fmt, type Tone } from "./ui";

const STATUS: Record<UsageStatus, { label: string; tone: Tone }> = {
  sufficient: { label: "사용량 충분", tone: "good" },
  tight: { label: "여유 적음", tone: "warn" },
  insufficient: { label: "사용량 부족", tone: "bad" },
};

function headline(a: UsageAssessment): string {
  switch (a.status) {
    case "insufficient":
      return `현재 사용량으로 전체 PRD를 구현하기 어렵습니다. 기대값 기준 약 ${fmt(a.shortfall)}만큼 부족합니다.`;
    case "tight":
      return `기대값 기준으로는 전체 개발이 가능하지만, 최대 추정치(${fmt(a.totalMax)})는 사용 가능한 사용량을 넘을 수 있어 여유가 적습니다.`;
    default:
      return "현재 사용량으로 전체 PRD를 구현할 수 있을 것으로 예상됩니다.";
  }
}

interface Props {
  assessment: UsageAssessment;
  taskCount: number;
  budgetText: string;
  onBudget: (v: string) => void;
  /** 내 기록으로 보정하기 전의 전체 기대 사용량 (보정이 없으면 생략) */
  baseExpected?: number;
}

export function UsageSummary({ assessment: a, taskCount, budgetText, onBudget, baseExpected }: Props) {
  const s = STATUS[a.status];
  const scale = Math.max(a.totalMax, a.budget, 1) * 1.05;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;

  return (
    <Card>
      <SectionTitle eyebrow="AI Development Usage">현재 상황</SectionTitle>
      <div className="grid gap-5 sm:grid-cols-3">
        <Stat
          label={`전체 예상 개발 사용량 (${taskCount}개 Task)`}
          value={fmt(a.totalExpected)}
          sub={
            `추정 범위 ${fmt(a.totalMin)}~${fmt(a.totalMax)}` +
            (baseExpected !== undefined && Math.abs(baseExpected - a.totalExpected) >= 0.05
              ? ` · 내 기록 보정 (보정 전 ${fmt(baseExpected)})`
              : "")
          }
        />
        <div>
          <label htmlFor="budget-live" className="text-xs text-slate-500 dark:text-slate-400">
            현재 사용 가능한 사용량
          </label>
          <input
            id="budget-live"
            inputMode="decimal"
            value={budgetText}
            onChange={(e) => onBudget(e.target.value)}
            className="mt-0.5 block w-28 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-2xl font-semibold tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">수정하면 아래 계획이 바로 다시 계산됩니다</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">상태</div>
          <div className="mt-2">
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
        </div>
      </div>

      <div className="relative mt-6 pb-7">
        <div className="relative h-3.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="absolute inset-y-0 bg-indigo-200 dark:bg-indigo-900"
            style={{ left: pct(a.totalMin), width: pct(Math.max(0, a.totalMax - a.totalMin)) }}
          />
          <div className="absolute inset-y-0 left-0 bg-indigo-500" style={{ width: pct(a.totalExpected) }} />
        </div>
        <div
          className="absolute -top-1 h-6 w-0.5 bg-slate-900 dark:bg-slate-100"
          style={{ left: pct(a.budget) }}
          aria-hidden
        />
        <div
          className="absolute top-6 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-slate-700 dark:text-slate-300"
          style={{ left: pct(a.budget) }}
        >
          사용 가능 {fmt(a.budget)}
        </div>
      </div>

      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{headline(a)}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        진한 막대는 기대값, 연한 구간은 추정 범위입니다. 실제 사용량은 코드베이스·컨텍스트·디버깅에 따라 달라질 수 있습니다.
      </p>
    </Card>
  );
}
