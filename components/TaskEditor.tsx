"use client";

import { useState } from "react";
import type { Calibration } from "@/lib/calibration";
import type { AnalyzedTask, Level, PlannedTask, PrdAnalysis } from "@/lib/types";
import { CONFIDENCE_LABEL, Card, HelpButton, IMPORTANCE_LABEL, SectionTitle, fmt } from "./ui";

interface Props {
  /** 권장 개발 순서로 정렬된 Task (의존성 검증을 거친 값) */
  order: PlannedTask[];
  onChange: (id: string, patch: Partial<Pick<AnalyzedTask, "importance" | "usageMin" | "usageMax">>) => void;
  source: PrdAnalysis["source"];
  /** 사용자 기록으로 보정된 Task 정보 (없으면 보정 안 됨) */
  calibrations?: Map<string, Calibration>;
  /** 보정 배율 설명 팝업 열기 */
  onHelp?: () => void;
}

const cell =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

/** 입력 중에는 로컬 텍스트를 쓰고, 포커스를 잃을 때 한 번만 확정한다 (입력 도중 값이 튀지 않도록) */
function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const commit = () => {
    setEditing(false);
    const n = Number(text);
    if (text.trim() !== "" && Number.isFinite(n) && n >= 0 && n !== value) onCommit(n);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={editing ? text : String(value)}
      onFocus={() => {
        setText(String(value));
        setEditing(true);
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`${cell} w-16 tabular-nums`}
    />
  );
}

function CalibrationNote({ cal }: { cal: Calibration }) {
  const base = cal.baseMin === cal.baseMax ? fmt(cal.baseMin) : `${fmt(cal.baseMin)}~${fmt(cal.baseMax)}`;
  return (
    <div className="mt-1 text-xs text-indigo-600">
      {cal.source === "task"
        ? `보정됨: 기존 ${base} → 내 기록 ${cal.samples}건 (×${cal.ratio.toFixed(2)})`
        : `전체 경향 ×${cal.ratio.toFixed(2)} 약하게 반영 (기존 ${base})`}
    </div>
  );
}

export function TaskEditor({ order, onChange, source, calibrations, onHelp }: Props) {
  const nameOf = new Map(order.map((p) => [p.task.id, p.task.name]));

  return (
    <section>
      <SectionTitle eyebrow="기능 상세">분석된 기능 · 전체 개발 순서</SectionTitle>
      <p className="mb-3 text-sm text-slate-600">
        {source === "heuristic"
          ? "규칙 기반 간이 분석 결과입니다. "
          : source === "sample"
            ? "샘플 데이터입니다. "
            : "AI가 추정한 값입니다. "}
        <span className="font-semibold text-slate-900">✎ 표시 항목(중요도·예상 사용량)</span>을 직접 고치면 위의 계획이 바로
        다시 계산됩니다.
      </p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">순서</th>
              <th className="w-[34%] px-2 py-2.5 font-semibold">기능</th>
              <th className="px-2 py-2.5 font-semibold">선행 기능</th>
              <th className="whitespace-nowrap px-2 py-2.5 font-semibold">중요도 ✎</th>
              <th className="whitespace-nowrap px-2 py-2.5 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  예상 사용량 (최소~최대) ✎
                  {onHelp && <HelpButton onClick={onHelp} label="보정 배율이 어떻게 정해지는지 보기" />}
                </span>
              </th>
              <th className="whitespace-nowrap px-4 py-2.5 font-semibold">신뢰도</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {order.map((p) => (
              <tr key={p.task.id} className="align-top">
                <td className="px-4 py-3 font-semibold tabular-nums text-slate-500">
                  {String(p.order).padStart(2, "0")}
                </td>
                <td className="px-2 py-3">
                  <div className="font-bold text-slate-900">{p.task.name}</div>
                  {p.task.description && <div className="max-w-sm text-sm text-slate-700">{p.task.description}</div>}
                  <div className="mt-0.5 max-w-sm text-xs text-slate-600">{p.reason}</div>
                </td>
                <td className="px-2 py-3 text-xs text-slate-600">
                  {p.task.dependsOn.length ? p.task.dependsOn.map((d) => nameOf.get(d) ?? d).join(", ") : "—"}
                </td>
                <td className="px-2 py-3">
                  <select
                    aria-label={`${p.task.name} 중요도`}
                    value={p.task.importance}
                    onChange={(e) => onChange(p.task.id, { importance: Number(e.target.value) as Level })}
                    className={cell}
                  >
                    {([5, 4, 3, 2, 1] as Level[]).map((l) => (
                      <option key={l} value={l}>
                        {l} · {IMPORTANCE_LABEL[l]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-1.5">
                    <NumField
                      label={`${p.task.name} 최소 사용량`}
                      value={p.task.usageMin}
                      onCommit={(v) => onChange(p.task.id, { usageMin: v })}
                    />
                    <span className="text-slate-400">~</span>
                    <NumField
                      label={`${p.task.name} 최대 사용량`}
                      value={p.task.usageMax}
                      onCommit={(v) => onChange(p.task.id, { usageMax: v })}
                    />
                  </div>
                  {calibrations?.get(p.task.id) && <CalibrationNote cal={calibrations.get(p.task.id)!} />}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {CONFIDENCE_LABEL[p.task.confidence]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
