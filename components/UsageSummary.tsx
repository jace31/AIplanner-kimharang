"use client";

import type { UsageAssessment, UsageStatus } from "@/lib/types";
import { Card, HelpButton, PencilIcon, fmt } from "./ui";

const STATUS: Record<UsageStatus, { label: string; strip: string; dot: string; accent: string }> = {
  insufficient: {
    label: "사용량 부족",
    strip: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    accent: "text-red-600",
  },
  tight: {
    label: "여유 적음",
    strip: "border-amber-200 bg-amber-50 text-amber-900",
    dot: "bg-amber-500",
    accent: "text-amber-600",
  },
  sufficient: {
    label: "사용량 충분",
    strip: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    accent: "text-emerald-600",
  },
};

function headline(a: UsageAssessment): string {
  switch (a.status) {
    case "insufficient":
      return "현재 사용량으로 전체 PRD를 구현하기 어렵습니다.";
    case "tight":
      return "전체 개발은 가능하지만, 최대 추정치는 가용 사용량을 넘을 수 있어 여유가 적습니다.";
    default:
      return "현재 사용량으로 전체 PRD를 구현할 수 있을 것으로 예상됩니다.";
  }
}

/** 예산 막대: 가용 범위 안의 예상은 파랑, 예산을 넘는 초과분은 붉은 빗금으로 분리한다. */
function BudgetBar({ a }: { a: UsageAssessment }) {
  const scale = Math.max(a.totalMax, a.budget, 1) * 1.04;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const within = Math.min(a.totalExpected, a.budget);
  const over = Math.max(0, a.totalExpected - a.budget);
  const overWide = (over / scale) * 100 >= 12;
  const hatch = {
    backgroundImage:
      "repeating-linear-gradient(135deg, #dc2626 0, #dc2626 6px, #fecaca 6px, #fecaca 12px)",
  };

  return (
    <div className="mt-6">
      {/* 예상 총량 라벨 (막대 위) */}
      <div className="relative h-6">
        <div
          className="absolute bottom-0 -translate-x-full whitespace-nowrap pr-1 text-xs font-bold text-slate-900"
          style={{ left: pct(a.totalExpected) }}
        >
          예상 {fmt(a.totalExpected)}
          <span className="ml-1 inline-block h-2 w-0.5 translate-y-0.5 bg-slate-900" />
        </div>
      </div>

      <div className="relative">
        <div className="relative h-7 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
          {/* 추정 범위(최소~최대) */}
          <div
            className={`absolute inset-y-0 ${over > 0 ? "bg-red-100" : "bg-indigo-100"}`}
            style={{ left: pct(a.totalMin), width: pct(Math.max(0, a.totalMax - a.totalMin)) }}
          />
          {/* 가용 범위 안의 예상 */}
          <div className="absolute inset-y-0 left-0 bg-indigo-600" style={{ width: pct(within) }} />
          {/* 예산 초과분: 붉은 빗금 */}
          {over > 0 && (
            <div
              className="absolute inset-y-0"
              style={{ left: pct(a.budget), width: pct(over), ...hatch }}
              aria-label={`예산 초과 ${fmt(over)}`}
            />
          )}
        </div>
        {over > 0 && overWide && (
          <div
            className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white shadow"
            style={{ left: pct(a.budget + over / 2) }}
          >
            초과 +{fmt(over)}
          </div>
        )}
        {/* 예산 기준선 */}
        <div
          className="absolute -bottom-2 -top-2 w-0.5 bg-slate-900"
          style={{ left: pct(a.budget) }}
          aria-hidden
        />
      </div>

      {/* 기준선 라벨 (막대 아래) */}
      <div className="relative h-7">
        <div
          className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-xs font-bold text-white"
          style={{ left: pct(a.budget) }}
        >
          가용 {fmt(a.budget)}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-indigo-600" />
          가용 범위 안의 예상
        </span>
        {over > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={hatch} />
            예산 초과분
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-sm ${over > 0 ? "bg-red-100" : "bg-indigo-100"}`} />
          추정 범위 ({fmt(a.totalMin)}~{fmt(a.totalMax)})
        </span>
      </div>
    </div>
  );
}

interface Props {
  assessment: UsageAssessment;
  taskCount: number;
  budgetText: string;
  onBudget: (v: string) => void;
  /** 내 기록으로 보정하기 전의 전체 기대 사용량 (보정이 없으면 생략) */
  baseExpected?: number;
  /** 보정 배율 설명 팝업 열기 */
  onHelp?: () => void;
}

export function UsageSummary({ assessment: a, taskCount, budgetText, onBudget, baseExpected, onHelp }: Props) {
  const s = STATUS[a.status];
  const calibrated = baseExpected !== undefined && Math.abs(baseExpected - a.totalExpected) >= 0.05;

  // 셋째 지표: 부족(초과 필요)이면 부족분, 아니면 여유분
  const gap = a.budget - a.totalExpected;
  const third =
    a.status === "insufficient"
      ? {
          label: "부족분",
          value: `−${fmt(a.shortfall)}`,
          sub: `가용량의 ${(a.totalExpected / a.budget).toFixed(1)}배가 필요해요`,
        }
      : a.status === "tight"
        ? {
            label: "여유분 (기대값 기준)",
            value: `+${fmt(gap)}`,
            sub: `최대 추정 시 ${fmt(a.totalMax - a.budget)} 부족할 수 있어요`,
          }
        : {
            label: "여유분",
            value: `+${fmt(gap)}`,
            sub: `가용량의 ${Math.round((a.totalExpected / a.budget) * 100)}%만 사용해요`,
          };

  return (
    <Card className="overflow-hidden p-0">
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-6 py-3 ${s.strip}`}>
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
        <span className="text-sm">{headline(a)}</span>
      </div>

      <div className="p-6">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
          {/* 1. 예상 필요 사용량 — 이 화면의 주인공 */}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-600">예상 필요 사용량</div>
            <div className="mt-1 text-6xl font-extrabold leading-none tabular-nums text-slate-900">
              {fmt(a.totalExpected)}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {taskCount}개 기능 · 추정 범위 {fmt(a.totalMin)}~{fmt(a.totalMax)}
              {calibrated && (
                <span className="ml-1 inline-flex items-center gap-1 align-middle text-indigo-600">
                  · 내 기록 보정 (보정 전 {fmt(baseExpected!)})
                  {onHelp && <HelpButton onClick={onHelp} label="보정 배율이 어떻게 정해지는지 보기" />}
                </span>
              )}
            </div>
          </div>

          {/* 2. 가용 사용량 — 직접 수정해 시뮬레이션하는 입력 */}
          <div className="min-w-0">
            <label htmlFor="budget-live" className="flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              가용 사용량
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">수정 가능</span>
            </label>
            <div className="group mt-1 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 pb-0.5 pt-1 transition focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100 hover:border-indigo-400">
              <input
                id="budget-live"
                inputMode="decimal"
                size={1}
                value={budgetText}
                onChange={(e) => onBudget(e.target.value)}
                className="w-full min-w-0 flex-1 border-b-4 border-indigo-500 bg-transparent pb-0.5 text-6xl font-extrabold leading-none tabular-nums text-indigo-700 outline-none"
              />
              <PencilIcon className="h-6 w-6 shrink-0 text-indigo-400 transition group-focus-within:text-indigo-600 group-hover:text-indigo-600" />
            </div>
            <div className="mt-2 text-xs text-slate-500">값을 바꾸면 아래 계획이 바로 다시 계산돼요</div>
          </div>

          {/* 3. 부족분 / 여유분 */}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-600">{third.label}</div>
            <div className={`mt-1 text-6xl font-extrabold leading-none tabular-nums ${s.accent}`}>{third.value}</div>
            <div className="mt-2 text-xs text-slate-500">{third.sub}</div>
          </div>
        </div>

        <BudgetBar a={a} />

        <p className="mt-4 text-xs text-slate-500">
          실제 사용량은 코드베이스·컨텍스트·디버깅에 따라 달라질 수 있어, 예상은 범위로 표시합니다.
        </p>
      </div>
    </Card>
  );
}
