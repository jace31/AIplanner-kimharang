"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CalibrationBar } from "@/components/CalibrationBar";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { MvpResult } from "@/components/MvpResult";
import { PhasedResult } from "@/components/PhasedResult";
import { PROVIDER_LABEL, PrdForm, type AnalyzeMode } from "@/components/PrdForm";
import { StrategyPicker, type Strategy } from "@/components/StrategyPicker";
import { TaskEditor } from "@/components/TaskEditor";
import { UsageSummary } from "@/components/UsageSummary";
import { Card } from "@/components/ui";
import { calibrateTasks, summarizeRecords, type Calibration } from "@/lib/calibration";
import { buildPlan, taskCost } from "@/lib/optimizer";
import { addRecords, clearRecords, getRecords, getServerRecords, removeRecord, subscribeRecords } from "@/lib/recordStore";
import { SAMPLE_PRD } from "@/lib/samplePrd";
import type { AnalyzedTask, PrdAnalysis } from "@/lib/types";

const positive = (text: string): number | null => {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

export default function Home() {
  const [prd, setPrd] = useState("");
  const [budgetText, setBudgetText] = useState("50");
  const [capacityText, setCapacityText] = useState("");
  const [mode, setMode] = useState<AnalyzeMode | null>(null);

  const [analysis, setAnalysis] = useState<PrdAnalysis | null>(null);
  const [tasks, setTasks] = useState<AnalyzedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [analysisId, setAnalysisId] = useState(0);
  // 화면 전환: 계획 화면 ↔ 실제 사용량 기록 화면 (두 화면 모두 마운트된 채 숨김 처리해 입력 중인 값을 유지한다)
  const [view, setView] = useState<"planner" | "records">("planner");
  // 사용량 기록 보정: 사용자가 직접 수정한 Task는 보정에서 제외한다
  const [calOn, setCalOn] = useState(true);
  const [manualIds, setManualIds] = useState<ReadonlySet<string>>(new Set());
  const records = useSyncExternalStore(subscribeRecords, getRecords, getServerRecords);

  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/analyze")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: AnalyzeMode | null) => m && setMode(m))
      .catch(() => {});
  }, []);

  const budget = positive(budgetText);
  const capacity = positive(capacityText) ?? budget;

  // 모든 계획은 순수 함수로 클라이언트에서 즉시 재계산된다 (Task/사용량 수정 시 바로 반영)
  const calibrated = useMemo(
    () =>
      calOn
        ? calibrateTasks(tasks, records, { skipIds: manualIds })
        : { tasks, calibrations: new Map<string, Calibration>() },
    [calOn, tasks, records, manualIds],
  );
  const plan = useMemo(
    () => (analysis && budget && capacity ? buildPlan(calibrated.tasks, budget, capacity) : null),
    [analysis, calibrated, budget, capacity],
  );
  const recordSummary = useMemo(() => summarizeRecords(records), [records]);
  const baseExpected = useMemo(() => tasks.reduce((s, t) => s + taskCost(t), 0), [tasks]);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prd }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "분석에 실패했습니다.");
      setAnalysis(data as PrdAnalysis);
      setTasks((data as PrdAnalysis).tasks);
      setManualIds(new Set());
      setAnalysisId((n) => n + 1);
      setStrategy(null);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function openView(next: "planner" | "records") {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function editTask(id: string, patch: Partial<Pick<AnalyzedTask, "importance" | "usageMin" | "usageMax">>) {
    const editsUsage = patch.usageMin !== undefined || patch.usageMax !== undefined;
    // 화면에 보이던(보정된) 값에서 이어서 수정하고, 직접 수정한 Task는 이후 보정에서 제외한다
    const shown = calibrated.tasks.find((t) => t.id === id);
    if (editsUsage) setManualIds((prev) => new Set(prev).add(id));
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const start = editsUsage && shown ? { ...t, usageMin: shown.usageMin, usageMax: shown.usageMax } : t;
        const next = { ...start, ...patch };
        // 범위가 뒤집히지 않도록 반대편 값을 맞춘다
        if (patch.usageMin !== undefined && next.usageMin > next.usageMax) next.usageMax = next.usageMin;
        if (patch.usageMax !== undefined && next.usageMax < next.usageMin) next.usageMin = next.usageMax;
        return next;
      }),
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
            AI Development Usage Planner
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            내가 가진 제한된 AI 개발 사용량으로 이 PRD를 어디까지, 어떤 순서로 개발할 수 있을까?
          </p>
        </div>
        <button
          type="button"
          onClick={() => openView("records")}
          aria-current={view === "records" ? "page" : undefined}
          className={`shrink-0 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
            view === "records"
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          실제 사용량 기록
          {recordSummary.count > 0 && (
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                view === "records"
                  ? "bg-white/25 text-white"
                  : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              }`}
            >
              {recordSummary.count}
            </span>
          )}
        </button>
      </header>

      <div className="space-y-8" hidden={view !== "planner"}>
        {!analysis ? (
          <PrdForm
            prd={prd}
            onPrd={setPrd}
            budgetText={budgetText}
            onBudget={setBudgetText}
            capacityText={capacityText}
            onCapacity={setCapacityText}
            onSample={() => setPrd(SAMPLE_PRD)}
            onSubmit={analyze}
            loading={loading}
            error={error}
            mode={mode}
          />
        ) : (
          <Card className="flex flex-wrap items-center justify-between gap-3 py-3.5">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{analysis.projectName}</div>
              {analysis.summary && (
                <div className="truncate text-sm text-slate-500 dark:text-slate-400">{analysis.summary}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setAnalysis(null);
                setStrategy(null);
              }}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              PRD 수정 / 다시 분석
            </button>
          </Card>
        )}

        <div ref={resultsRef} className="scroll-mt-6 space-y-8">
          {analysis && !budget && (
            <div role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              현재 사용 가능한 사용량에 0보다 큰 숫자를 입력해 주세요.
            </div>
          )}

          {analysis && (
            <div className="rounded-lg bg-slate-100 px-4 py-2.5 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
              {analysis.source === "llm"
                ? `${analysis.provider ? PROVIDER_LABEL[analysis.provider] : "AI"}(${analysis.model})가 분석한 추정치입니다. 사용량 단위는 "한 번의 사용 한도 = 100"이며, 실제 사용량은 달라질 수 있습니다.`
                : "규칙 기반 간이 분석 결과입니다. 정확도가 낮을 수 있어 아래 표에서 직접 조정할 수 있습니다."}
            </div>
          )}

          {plan && (
            <>
              {plan.warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {plan.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              )}

              <CalibrationBar
                enabled={calOn}
                onToggle={setCalOn}
                recordCount={recordSummary.count}
                meanRatio={recordSummary.meanRatio}
                calibratedCount={calibrated.calibrations.size}
                taskCount={plan.tasks.length}
                onOpenRecords={() => openView("records")}
              />

              <UsageSummary
                assessment={plan.assessment}
                taskCount={plan.tasks.length}
                budgetText={budgetText}
                onBudget={setBudgetText}
                baseExpected={calibrated.calibrations.size > 0 ? baseExpected : undefined}
              />

              <StrategyPicker
                strategy={strategy}
                onSelect={setStrategy}
                mvp={plan.mvp}
                phased={plan.phased}
                taskCount={plan.tasks.length}
              />

              {strategy === "mvp" && <MvpResult mvp={plan.mvp} total={plan.tasks.length} />}
              {strategy === "phased" && <PhasedResult plan={plan.phased} taskCount={plan.tasks.length} />}

              <TaskEditor
                order={plan.order}
                onChange={editTask}
                source={analysis!.source}
                calibrations={calibrated.calibrations}
              />
            </>
          )}
        </div>
      </div>

      <div hidden={view !== "records"}>
        <FeedbackPanel
          key={analysisId}
          project={analysis?.projectName ?? ""}
          rows={
            plan
              ? plan.order.map((p) => {
                  const base = tasks.find((t) => t.id === p.task.id) ?? p.task;
                  return {
                    id: p.task.id,
                    name: p.task.name,
                    baseMin: base.usageMin,
                    baseMax: base.usageMax,
                    predMin: p.task.usageMin,
                    predMax: p.task.usageMax,
                  };
                })
              : []
          }
          records={records}
          onSave={addRecords}
          onRemove={removeRecord}
          onClear={clearRecords}
          onBack={() => openView("planner")}
        />
      </div>

      <footer className="mt-12 text-center text-xs text-slate-400">
        예상 사용량은 추정 범위이며 정확한 토큰 수가 아닙니다.
      </footer>
    </main>
  );
}
