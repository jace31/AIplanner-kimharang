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
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  accent: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
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
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
    >
      <div
        className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-indigo-500"}`}
        style={{ width: `${Math.min(100, ratio * 100)}%` }}
      />
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, children }: { eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      {eyebrow && (
        <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          {eyebrow}
        </div>
      )}
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{children}</h2>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}
