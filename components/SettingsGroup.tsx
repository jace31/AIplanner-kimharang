"use client";

import { Card, HelpButton } from "./ui";

interface Props {
  projectName: string;
  summary: string;
  onEditPrd: () => void;
  /** 사용량 기록 보정 */
  calibration: {
    enabled: boolean;
    onToggle: (v: boolean) => void;
    recordCount: number;
    meanRatio: number;
    calibratedCount: number;
    taskCount: number;
    onOpenRecords: () => void;
    /** 보정 배율 설명 팝업 열기 */
    onHelp: () => void;
  };
}

/** 분석 설정 그룹: 지금 분석 중인 PRD와, 내 사용량 기록으로 보정할지 여부를 한 카드에 모은다. */
export function SettingsGroup({ projectName, summary, onEditPrd, calibration: c }: Props) {
  const has = c.recordCount > 0;
  const on = c.enabled && has;

  return (
    <Card className="overflow-hidden p-0">
      {/* PRD */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">분석 중인 PRD</div>
          <div className="mt-0.5 text-lg font-bold text-slate-900">{projectName}</div>
          {summary && <p className="mt-0.5 text-sm text-slate-600">{summary}</p>}
        </div>
        <button
          type="button"
          onClick={onEditPrd}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          PRD 수정 / 다시 분석
        </button>
      </div>

      {/* 보정 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
        <div className="min-w-0 text-sm">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
            내 사용량 기록으로 보정
            <HelpButton onClick={c.onHelp} label="보정 배율이 어떻게 정해지는지 보기" />
          </div>
          <div className="text-slate-600">
            {has ? (
              <>
                기록 {c.recordCount}건 · 내 실제 사용량은 예상의 평균 <strong className="text-slate-900">×{c.meanRatio.toFixed(2)}</strong>
                {on && ` · ${c.taskCount}개 중 ${c.calibratedCount}개 기능에 반영`}
              </>
            ) : (
              <>
                개발 후 실제 사용량을 기록하면, 다음 추정부터 내 개발 방식에 맞게 보정됩니다.{" "}
                <button
                  type="button"
                  onClick={c.onOpenRecords}
                  className="font-semibold text-indigo-600 underline underline-offset-2"
                >
                  실제 사용량 기록하기
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span>{on ? "사용 중" : "꺼짐"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="내 사용량 기록으로 보정"
            disabled={!has}
            onClick={() => c.onToggle(!c.enabled)}
            className={`relative h-6 w-11 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
              on ? "bg-indigo-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                on ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </Card>
  );
}
