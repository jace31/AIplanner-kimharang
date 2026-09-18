"use client";

import { Card } from "./ui";

interface Props {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  recordCount: number;
  meanRatio: number;
  calibratedCount: number;
  taskCount: number;
  /** 실제 사용량 기록 화면 열기 */
  onOpenRecords: () => void;
}

export function CalibrationBar({
  enabled,
  onToggle,
  recordCount,
  meanRatio,
  calibratedCount,
  taskCount,
  onOpenRecords,
}: Props) {
  const has = recordCount > 0;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <div className="min-w-0 text-sm">
        <div className="font-semibold text-slate-900 dark:text-slate-100">내 사용량 기록으로 보정</div>
        <div className="text-slate-500 dark:text-slate-400">
          {has ? (
            <>
              기록 {recordCount}건 · 내 실제 사용량은 예상의 평균 <strong>×{meanRatio.toFixed(2)}</strong>
              {enabled && ` · ${taskCount}개 중 ${calibratedCount}개 기능에 반영`}
            </>
          ) : (
            <>
              개발 후 실제 사용량을 기록하면, 다음 추정부터 내 개발 방식에 맞게 보정됩니다.{" "}
              <button
                type="button"
                onClick={onOpenRecords}
                className="font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
              >
                실제 사용량 기록하기
              </button>
            </>
          )}
        </div>
      </div>
      <label className={`flex items-center gap-2 text-sm ${has ? "" : "opacity-50"}`}>
        <input
          type="checkbox"
          checked={enabled && has}
          disabled={!has}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 accent-indigo-600"
        />
        보정 사용
      </label>
    </Card>
  );
}
