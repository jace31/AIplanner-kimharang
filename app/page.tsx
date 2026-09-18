"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CalibrationHelp } from "@/components/CalibrationHelp";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { MvpResult } from "@/components/MvpResult";
import { PhasedResult } from "@/components/PhasedResult";
import { PROVIDER_LABEL, PrdForm, type AnalyzeMode } from "@/components/PrdForm";
import { SettingsGroup } from "@/components/SettingsGroup";
import { StrategyPicker, type Strategy } from "@/components/StrategyPicker";
import { TaskEditor } from "@/components/TaskEditor";
import { UsageSummary } from "@/components/UsageSummary";
import { InfoIcon } from "@/components/ui";
import { calibrateTasks, summarizeRecords, type Calibration } from "@/lib/calibration";
import { buildPlan, taskCost } from "@/lib/optimizer";
import { addRecords, clearRecords, getRecords, getServerRecords, removeRecord, subscribeRecords } from "@/lib/recordStore";
import { SAMPLE_ANALYSIS } from "@/lib/sampleAnalysis";
import { SAMPLE_PRD, isSamplePrd } from "@/lib/samplePrd";
import type { AnalyzedTask, PrdAnalysis } from "@/lib/types";

const positive = (text: string): number | null => {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

/** 분석 결과가 어떻게 만들어졌는지 알려주는 한 줄 안내 (상단의 얇은 배너로 표시) */
function sourceNotice(a: PrdAnalysis): string {
  if (a.source === "llm") {
    const who = a.provider ? PROVIDER_LABEL[a.provider] : "AI";
    return `${who}(${a.model})가 분석한 추정치입니다. 사용량 단위는 "한 번의 사용 한도 = 100"이며, 실제 사용량은 달라질 수 있어요.`;
  }
  if (a.source === "sample") {
    return "샘플 결과입니다. API를 호출하지 않고 미리 준비한 데이터를 보여줘요. 직접 작성한 PRD를 넣으면 AI가 새로 분석합니다.";
  }
  return "규칙 기반 간이 분석 결과입니다. 정확도가 낮을 수 있어 아래 표에서 직접 조정할 수 있어요.";
}

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
  const [helpOpen, setHelpOpen] = useState(false); // 보정 배율 설명 팝업
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

  function showAnalysis(result: PrdAnalysis) {
    setAnalysis(result);
    setTasks(result.tasks.map((t) => ({ ...t, dependsOn: [...t.dependsOn] })));
    setManualIds(new Set());
    setAnalysisId((n) => n + 1);
    setStrategy(null);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function analyze() {
    setError(null);
    // 샘플 PRD는 API를 호출하지 않고 미리 준비한 결과를 보여준다 (키가 없거나 무료 한도를 다 썼을 때도 체험 가능)
    if (isSamplePrd(prd)) {
      showAnalysis(SAMPLE_ANALYSIS);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prd }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "분석에 실패했습니다.");
      showAnalysis(data as PrdAnalysis);
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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">AI Development Usage Planner</h1>
          <p className="mt-1.5 text-slate-600">
            내가 가진 제한된 AI 개발 사용량으로, 이 PRD를 어디까지 · 어떤 순서로 개발할 수 있을까?
          </p>
        </div>
        <button
          type="button"
          onClick={() => openView("records")}
          aria-current={view === "records" ? "page" : undefined}
          className={`shrink-0 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
            view === "records"
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          }`}
        >
          실제 사용량 기록
          {recordSummary.count > 0 && (
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                view === "records" ? "bg-white/25 text-white" : "bg-indigo-100 text-indigo-800"
              }`}
            >
              {recordSummary.count}
            </span>
          )}
        </button>
      </header>

      <div className="space-y-6" hidden={view !== "planner"}>
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
          <>
            {/* 안내는 상단의 얇은 배너로 */}
            <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <InfoIcon className="h-4 w-4 shrink-0 text-sky-600" />
              <span>{sourceNotice(analysis)}</span>
            </div>

            {/* PRD + 보정 설정을 한 그룹으로 */}
            <SettingsGroup
              projectName={analysis.projectName}
              summary={analysis.summary}
              onEditPrd={() => {
                setAnalysis(null);
                setStrategy(null);
              }}
              calibration={{
                enabled: calOn,
                onToggle: setCalOn,
                recordCount: recordSummary.count,
                meanRatio: recordSummary.meanRatio,
                calibratedCount: calibrated.calibrations.size,
                taskCount: tasks.length,
                onOpenRecords: () => openView("records"),
                onHelp: () => setHelpOpen(true),
              }}
            />
          </>
        )}

        <div ref={resultsRef} className="scroll-mt-6 space-y-8">
          {analysis && !budget && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              가용 사용량에 0보다 큰 숫자를 입력해 주세요.
            </div>
          )}

          {plan && (
            <>
              {plan.warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {plan.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              )}

              <UsageSummary
                assessment={plan.assessment}
                taskCount={plan.tasks.length}
                budgetText={budgetText}
                onBudget={setBudgetText}
                baseExpected={calibrated.calibrations.size > 0 ? baseExpected : undefined}
                onHelp={() => setHelpOpen(true)}
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
                onHelp={() => setHelpOpen(true)}
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

      <footer className="mt-12 text-center text-xs text-slate-500">
        예상 사용량은 추정 범위이며 정확한 토큰 수가 아닙니다.
      </footer>

      <CalibrationHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        records={records}
        onOpenRecords={() => {
          setHelpOpen(false);
          openView("records");
        }}
      />
    </main>
  );
}
