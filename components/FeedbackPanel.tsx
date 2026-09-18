"use client";

import { useState } from "react";
import { makeRecord, recordRatio, type UsageRecord } from "@/lib/calibration";
import { Card, SectionTitle, fmt } from "./ui";

export interface FeedbackRow {
  id: string;
  name: string;
  /** 보정 전 예상 (배율 계산 기준) */
  baseMin: number;
  baseMax: number;
  /** 화면에 보여준 예상 (보정 후) */
  predMin: number;
  predMax: number;
}

interface Props {
  /** 현재 분석한 프로젝트 이름 (분석 전이면 빈 문자열) */
  project: string;
  /** 현재 프로젝트의 기능 목록. 분석 전이면 빈 배열 */
  rows: FeedbackRow[];
  records: UsageRecord[];
  onSave: (records: UsageRecord[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** 계획 화면으로 돌아가기 */
  onBack: () => void;
}

const cell =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

const range = (min: number, max: number) => (min === max ? fmt(min) : `${fmt(min)}~${fmt(max)}`);
const positive = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

export function FeedbackPanel({ project, rows, records, onSave, onRemove, onClear, onBack }: Props) {
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [manual, setManual] = useState({ name: "", min: "", max: "", actual: "" });

  const filled = rows.filter((r) => positive(actuals[r.id] ?? "") !== null);

  function saveActuals() {
    onSave(
      filled.map((r) =>
        makeRecord({
          project,
          taskName: r.name,
          estMin: r.baseMin,
          estMax: r.baseMax,
          actual: positive(actuals[r.id])!,
          predictedMin: r.predMin,
          predictedMax: r.predMax,
        }),
      ),
    );
    setActuals({});
    setNotice(`${filled.length}개 기능의 실제 사용량을 저장했습니다. 같은 종류의 기능 예상이 내 기록에 맞게 보정됩니다.`);
  }

  const manualMin = positive(manual.min);
  const manualMax = positive(manual.max) ?? manualMin;
  const manualActual = positive(manual.actual);
  const manualOk = manual.name.trim() !== "" && manualMin !== null && manualMax !== null && manualActual !== null;

  function addManual() {
    if (!manualOk) return;
    onSave([
      makeRecord({
        project: "직접 입력",
        taskName: manual.name,
        estMin: manualMin,
        estMax: manualMax,
        actual: manualActual,
      }),
    ]);
    setManual({ name: "", min: "", max: "", actual: "" });
    setNotice(`"${manual.name.trim()}" 기록을 추가했습니다.`);
  }

  const sorted = [...records].sort((a, b) => b.recordedAt - a.recordedAt);

  return (
    <section>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        ← 계획으로 돌아가기
      </button>
      <SectionTitle eyebrow="Feedback">실제 사용량 기록 — 예상 vs 실제</SectionTitle>
      <p className="mb-3 text-sm text-slate-600">
        Claude Code로 개발해 보고 기능별로 실제로 쓴 사용량을 입력하세요. 같은 종류의 기능(로그인·검색 등)은 다음 프로젝트에서
        내 실제 사용량에 맞게 보정됩니다. 기록은 이 브라우저에만 저장됩니다.
      </p>

      <div className="space-y-5">
        {rows.length === 0 ? (
          <Card>
            <div className="text-sm font-semibold text-slate-900">아직 분석한 프로젝트가 없어요</div>
            <p className="mt-1 text-sm text-slate-600">
              PRD를 분석하면 이 화면에서 그 프로젝트의 기능별 실제 사용량을 바로 기록할 수 있습니다. 예전에 개발한 기능은 아래에서
              직접 추가하세요.
            </p>
          </Card>
        ) : (
        <Card className="p-0">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
            이 프로젝트 — 개발을 끝낸 기능의 실제 사용량 (안 한 기능은 비워 두세요)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">기능</th>
                  <th className="px-2 py-2 font-medium">현재 예상</th>
                  <th className="px-2 py-2 font-medium">실제 사용량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-slate-900">{r.name}</td>
                    <td className="px-2 py-2 tabular-nums text-slate-600">
                      {range(r.predMin, r.predMax)}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        aria-label={`${r.name} 실제 사용량`}
                        inputMode="decimal"
                        value={actuals[r.id] ?? ""}
                        onChange={(e) => setActuals((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        className={`${cell} w-24 tabular-nums`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              disabled={filled.length === 0}
              onClick={saveActuals}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {filled.length > 0 ? `${filled.length}개 기록 저장` : "기록 저장"}
            </button>
          </div>
        </Card>
        )}

        <Card>
          <div className="mb-3 text-sm font-semibold text-slate-900">
            기록 직접 추가 — 예전에 개발한 기능도 넣을 수 있어요
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-500">
              기능 이름
              <input
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
                placeholder="예: 로그인"
                className={`${cell} mt-1 block w-40`}
              />
            </label>
            <label className="text-xs text-slate-500">
              당시 예상 (최소)
              <input
                inputMode="decimal"
                value={manual.min}
                onChange={(e) => setManual({ ...manual, min: e.target.value })}
                placeholder="8"
                className={`${cell} mt-1 block w-20 tabular-nums`}
              />
            </label>
            <label className="text-xs text-slate-500">
              (최대)
              <input
                inputMode="decimal"
                value={manual.max}
                onChange={(e) => setManual({ ...manual, max: e.target.value })}
                placeholder="12"
                className={`${cell} mt-1 block w-20 tabular-nums`}
              />
            </label>
            <label className="text-xs text-slate-500">
              실제 사용량
              <input
                inputMode="decimal"
                value={manual.actual}
                onChange={(e) => setManual({ ...manual, actual: e.target.value })}
                placeholder="17"
                className={`${cell} mt-1 block w-20 tabular-nums`}
              />
            </label>
            <button
              type="button"
              disabled={!manualOk}
              onClick={addManual}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </Card>

        {notice && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          >
            <span>{notice}</span>
            <button type="button" onClick={onBack} className="font-semibold underline underline-offset-2">
              계획 화면에서 확인
            </button>
          </div>
        )}

        {sorted.length > 0 && (
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">내 기록 ({sorted.length}건)</div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("저장된 모든 사용량 기록을 삭제할까요? 되돌릴 수 없습니다.")) {
                    onClear();
                    setNotice(null);
                  }
                }}
                className="text-xs font-medium text-rose-600 hover:underline"
              >
                전체 삭제
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">기능</th>
                    <th className="px-2 py-2 font-medium">기존 예상</th>
                    <th className="px-2 py-2 font-medium">실제</th>
                    <th className="px-2 py-2 font-medium">배율</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <div className="text-slate-900">{r.taskName}</div>
                        <div className="text-xs text-slate-500">{r.project}</div>
                      </td>
                      <td className="px-2 py-2 tabular-nums text-slate-600">
                        {range(r.estMin, r.estMax)}
                      </td>
                      <td className="px-2 py-2 font-medium tabular-nums text-slate-900">
                        {fmt(r.actual)}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-slate-600">
                        ×{recordRatio(r).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          aria-label={`${r.taskName} 기록 삭제`}
                          onClick={() => onRemove(r.id)}
                          className="text-xs text-slate-500 hover:text-rose-600"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}
