"use client";

import { useEffect, useRef } from "react";
import { CALIBRATION_PARAMS as P, globalRatio, recordRatio, summarizeRecords, type UsageRecord } from "@/lib/calibration";
import { fmt } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  records: UsageRecord[];
  /** 기록 화면 열기 (기록이 없을 때 안내 버튼) */
  onOpenRecords: () => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const range = (min: number, max: number) => (min === max ? fmt(min) : `${fmt(min)}~${fmt(max)}`);

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <div className="mt-1 space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
      </div>
    </section>
  );
}

function Example({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-indigo-50 px-3 py-2 text-[13px] text-indigo-950 ring-1 ring-inset ring-indigo-200">{children}</div>;
}

/**
 * "보정 배율이 어떻게 정해지는지" 설명 팝업. 네이티브 <dialog>를 써서 Esc 닫기·포커스 가둠·화면 최상단 표시를 브라우저에 맡긴다
 * (카드의 overflow-hidden에 잘리지 않는다). 숫자는 lib/calibration.ts의 실제 상수와 사용자의 기록에서 가져온다.
 */
export function CalibrationHelp({ open, onClose, records, onOpenRecords }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const { count, meanRatio } = summarizeRecords(records);
  const g = globalRatio(records);
  const recent = [...records].sort((a, b) => b.recordedAt - a.recordedAt);
  const shown = recent.slice(0, 8);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // 팝업 바깥(배경) 클릭 시 닫기
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="cal-help-title"
      className="m-auto max-h-[88vh] w-[min(92vw,36rem)] overflow-y-auto rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">도움말</div>
          <h2 id="cal-help-title" className="text-lg font-bold text-slate-900">
            보정 배율은 이렇게 정해져요
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="도움말 닫기"
          className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          ✕
        </button>
      </div>

      <div className="space-y-5 px-5 py-5">
        <p className="text-sm leading-relaxed text-slate-700">
          내가 직접 개발하고 기록한 <strong className="text-slate-900">예상 vs 실제</strong>를 보고, 다음 프로젝트의 예상
          사용량에 곱해 주는 값이에요. 기록이 쌓일수록 내 개발 방식에 맞아집니다.
        </p>

        <Step n={1} title="기록 하나의 배율">
          <p>
            <strong className="text-slate-900">배율 = 실제 사용량 ÷ 기존 예상(범위의 중앙값)</strong>
          </p>
          <Example>
            로그인: 예상 8~12 (중앙 10) → 실제 17 &nbsp;⇒&nbsp; <strong>×1.7</strong> (예상보다 70% 더 씀)
          </Example>
        </Step>

        <Step n={2} title="같은 종류의 기능 → 그 배율을 그대로 적용">
          <p>
            &lsquo;로그인·login·인증&rsquo;처럼 이름이 달라도 같은 종류면 같은 기능으로 봐요. 새 프로젝트의 예상 중앙값에 배율을 곱한
            값을 중심으로 범위를 다시 잡습니다.
          </p>
          <Example>
            중앙 10 × 1.7 = 17 → ±{pct(P.baseHalfWidth)} 범위 → <strong>14~20</strong>
          </Example>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              기록이 여러 건이면 <strong>최근 기록에 더 무게</strong>를 둬요 (최신 1 → 그다음 {P.recencyDecay} →{" "}
              {(P.recencyDecay ** 2).toFixed(2)} …).
            </li>
            <li>
              기록이 많고 서로 비슷할수록 범위가 좁아지고(최소 ±{pct(P.minHalfWidth)}), 들쭉날쭉하면 넓어져요(최대 ±
              {pct(P.maxHalfWidth)}).
            </li>
            <li>같은 종류 기록이 {P.highConfidenceSamples}건 이상이면 신뢰도가 &lsquo;높음&rsquo;으로 올라가요.</li>
          </ul>
        </Step>

        <Step n={3} title="기록이 없는 종류의 기능 → 전체 경향만 약하게">
          <p>
            내 모든 기록의 평균 배율을 <strong className="text-slate-900">(기록 수 + {P.globalPrior})</strong>로 희석해서 1 쪽으로
            당겨요. 기록이 적을수록 거의 반영하지 않고, 쌓일수록 강해집니다.
          </p>
          <Example>
            기록 1건이 ×1.7이면 → 전체 경향은 ×{Math.pow(1.7, 1 / (1 + P.globalPrior)).toFixed(2)}만 적용
          </Example>
          <p className="text-slate-900">
            {count > 0 ? (
              <>
                지금 내 기록 {count}건 기준 적용값: <strong>×{g.toFixed(2)}</strong>
              </>
            ) : (
              <span className="text-slate-500">기록이 생기면 여기에 지금 적용값이 표시돼요.</span>
            )}
          </p>
        </Step>

        <Step n={4} title="안전장치">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              배율은 ×{P.minRatio} ~ ×{P.maxRatio} 안으로 제한해요.
            </li>
            <li>항상 &lsquo;보정 전 원래 예상&rsquo; 기준으로 계산해서, 배율이 겹쳐 적용되지 않아요.</li>
            <li>화면에서 직접 고친 기능은 보정에서 빠져요.</li>
            <li>&lsquo;보정 사용&rsquo; 스위치로 언제든 끌 수 있어요.</li>
          </ul>
        </Step>

        <section className="rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <h3 className="text-sm font-bold text-slate-900">내 기록의 배율 ({count}건)</h3>
            {count > 0 && (
              <span className="text-xs text-slate-600">
                평균 <strong className="text-slate-900">×{meanRatio.toFixed(2)}</strong>
              </span>
            )}
          </div>

          {count === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-600">
              아직 기록이 없어요. 개발 후 실제 사용량을 기록하면 여기에 내 배율이 나타나요.
              <div className="mt-2">
                <button
                  type="button"
                  onClick={onOpenRecords}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  실제 사용량 기록하기
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{r.taskName}</div>
                      <div className="text-xs tabular-nums text-slate-600">
                        예상 {range(r.estMin, r.estMax)} → 실제 {fmt(r.actual)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-800">
                      ×{recordRatio(r).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              {recent.length > shown.length && (
                <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                  외 {recent.length - shown.length}건
                </div>
              )}
              <p className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs leading-relaxed text-slate-600">
                &lsquo;평균 ×{meanRatio.toFixed(2)}&rsquo;는 모든 기록 배율의 평균(기하평균)으로 참고용이에요. 기능마다 실제로
                적용되는 배율은 위 규칙에 따라 달라요.
              </p>
            </>
          )}
        </section>

        <p className="text-xs leading-relaxed text-slate-500">
          기록이 적을 때는 우연에 흔들릴 수 있어요. 정확한 값이 아니라 &lsquo;내 경향&rsquo;으로 봐 주세요.
        </p>
      </div>

      <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          닫기
        </button>
      </div>
    </dialog>
  );
}
