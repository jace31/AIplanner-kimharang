import type { AnalyzedTask, Confidence, Level } from "@/lib/types";

/** 소수 첫째 자리까지, 정수면 정수로 표시 */
export function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function usageRange(t: Pick<AnalyzedTask, "usageMin" | "usageMax">): string {
  return t.usageMin === t.usageMax ? fmt(t.usageMin) : `${fmt(t.usageMin)}~${fmt(t.usageMax)}`;
}

export const IMPORTANCE_LABEL: Record<Level, string> = {
  5: "매우 높음",
  4: "높음",
  3: "보통",
  2: "낮음",
  1: "매우 낮음",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  accent: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
  good: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  bad: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function importanceTone(level: Level): Tone {
  return level >= 4 ? "accent" : level === 3 ? "neutral" : "warn";
}

export function ImportanceBadge({ level }: { level: Level }) {
  return <Badge tone={importanceTone(level)}>중요도 {IMPORTANCE_LABEL[level]}</Badge>;
}

export function ConfidenceBadge({ level }: { level: Confidence }) {
  return <Badge tone={level === "low" ? "warn" : "neutral"}>신뢰도 {CONFIDENCE_LABEL[level]}</Badge>;
}

/** 사용량 막대: used/capacity. 넘치면 빨갛게 표시한다. */
export function UsageBar({ used, capacity, label }: { used: number; capacity: number; label?: string }) {
  const ratio = capacity > 0 ? used / capacity : 0;
  const over = ratio > 1;
  return (
    <div
      role="meter"
      aria-label={label ?? "사용량"}
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={used}
      className="h-3 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={`h-full rounded-full ${over ? "bg-red-500" : "bg-indigo-600"}`}
        style={{ width: `${Math.min(100, ratio * 100)}%` }}
      />
    </div>
  );
}

/** 기본 패딩(p-5)이 있고, className에 p-*를 넘기면 기본 패딩을 빼서 서로 충돌하지 않게 한다 */
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const padding = /(^|\s)p-\d/.test(className) ? "" : "p-5";
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${padding} ${className}`}>{children}</div>
  );
}

export function SectionTitle({ eyebrow, children }: { eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      {eyebrow && <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">{eyebrow}</div>}
      <h2 className="text-xl font-bold text-slate-900">{children}</h2>
    </div>
  );
}

/** 라벨이 위, 큰 숫자가 아래인 지표 블록. 숫자가 이 화면의 주인공이다. */
export function Stat({
  label,
  value,
  sub,
  valueClass = "text-slate-900",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold tabular-nums leading-tight ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** 작은 "?" 도움말 버튼. 누르면 onClick으로 도움말 팝업을 연다. */
export function HelpButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      title={label}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold leading-none text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      ?
    </button>
  );
}

export function PencilIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

export function InfoIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}
