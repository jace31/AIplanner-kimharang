/**
 * 서비스의 핵심 로직. LLM은 Task 추출/추정까지만 담당하고,
 * 사용량 계산·의존성 검증·MVP 선택·세션 분배·개발 순서는 모두 여기서 결정론적으로 계산한다.
 */
import type {
  AnalyzedTask,
  DevSession,
  ExcludedTask,
  Level,
  MvpPlan,
  PhasedPlan,
  PlannedTask,
  SessionItem,
  UsageAssessment,
} from "./types";

const EPS = 1e-9;

/** 중요도(1~5) → 중요도 가중치. 비선형으로 두어 핵심 기능(4~5)이 부가 기능보다 확실히 우선되게 한다. */
const VALUE_WEIGHT: Record<Level, number> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10 };

const round1 = (n: number) => Math.round(n * 10) / 10;

export const taskValue = (t: AnalyzedTask) => VALUE_WEIGHT[t.importance];

/** 계획에 쓰는 기대 사용량: 추정 범위의 중앙값 */
export const taskCost = (t: AnalyzedTask) => Math.max(0.1, round1((t.usageMin + t.usageMax) / 2));

// ---------------------------------------------------------------------------
// 1. 입력 정리 + 의존성 검증
// ---------------------------------------------------------------------------

/**
 * LLM/사용자 입력을 신뢰하지 않고 정리한다.
 * - 중복 id 제거, 존재하지 않거나 자기 자신을 가리키는 의존성 제거
 * - 사용량 범위 보정 (min <= max, 양수)
 * - 순환 의존성은 back edge를 끊어 DAG로 만든다
 */
export function sanitizeTasks(input: AnalyzedTask[]): { tasks: AnalyzedTask[]; warnings: string[] } {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const tasks: AnalyzedTask[] = [];

  for (const raw of input) {
    if (seen.has(raw.id)) {
      warnings.push(`중복된 Task id "${raw.id}"가 있어 뒤의 항목을 무시했습니다.`);
      continue;
    }
    seen.add(raw.id);
    const usageMin = Math.max(0.1, Math.min(raw.usageMin, raw.usageMax));
    const usageMax = Math.max(usageMin, raw.usageMin, raw.usageMax);
    tasks.push({ ...raw, usageMin, usageMax, dependsOn: [...raw.dependsOn] });
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    const cleaned = [...new Set(t.dependsOn)].filter((d) => d !== t.id && byId.has(d));
    if (cleaned.length !== new Set(t.dependsOn).size) {
      warnings.push(`"${t.name}"의 존재하지 않는 선행 기능 참조를 제거했습니다.`);
    }
    t.dependsOn = cleaned;
  }

  // 순환 제거 (DFS back edge)
  const color = new Map<string, 1 | 2>();
  const visit = (t: AnalyzedTask) => {
    color.set(t.id, 1);
    t.dependsOn = t.dependsOn.filter((depId) => {
      const dep = byId.get(depId)!;
      const c = color.get(depId);
      if (c === 1) {
        warnings.push(`순환 의존성을 발견해 "${t.name}" → "${dep.name}" 연결을 끊었습니다.`);
        return false;
      }
      if (c === undefined) visit(dep);
      return true;
    });
    color.set(t.id, 2);
  };
  for (const t of tasks) if (!color.has(t.id)) visit(t);

  return { tasks, warnings };
}

// ---------------------------------------------------------------------------
// 2. 사용량 평가
// ---------------------------------------------------------------------------

export function assessUsage(tasks: AnalyzedTask[], budget: number): UsageAssessment {
  const totalMin = round1(tasks.reduce((s, t) => s + t.usageMin, 0));
  const totalMax = round1(tasks.reduce((s, t) => s + t.usageMax, 0));
  const totalExpected = round1(tasks.reduce((s, t) => s + taskCost(t), 0));
  const status =
    totalExpected > budget + EPS ? "insufficient" : totalMax > budget + EPS ? "tight" : "sufficient";
  return {
    totalMin,
    totalMax,
    totalExpected,
    budget,
    status,
    shortfall: round1(Math.max(0, totalExpected - budget)),
  };
}

// ---------------------------------------------------------------------------
// 3. 그래프 유틸 + 개발 순서
// ---------------------------------------------------------------------------

/** 각 Task의 (직/간접) 후행 Task id 집합 */
function descendantsOf(tasks: AnalyzedTask[]): Map<string, Set<string>> {
  const ids = new Set(tasks.map((t) => t.id));
  const children = new Map<string, string[]>(tasks.map((t) => [t.id, []]));
  for (const t of tasks) for (const d of t.dependsOn) if (ids.has(d)) children.get(d)!.push(t.id);

  const memo = new Map<string, Set<string>>();
  const walk = (id: string): Set<string> => {
    const hit = memo.get(id);
    if (hit) return hit;
    const out = new Set<string>();
    memo.set(id, out); // DAG 전제. 방어적으로 먼저 등록
    for (const c of children.get(id) ?? []) {
      out.add(c);
      for (const g of walk(c)) out.add(g);
    }
    return out;
  };
  for (const t of tasks) walk(t.id);
  return memo;
}

/** 이 Task가 풀어주는 중요도: 자신의 가중치 + 뒤따르는 모든 Task의 가중치 */
function criticality(tasks: AnalyzedTask[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const desc = descendantsOf(tasks);
  const out = new Map<string, number>();
  for (const t of tasks) {
    let v = taskValue(t);
    for (const d of desc.get(t.id) ?? []) v += taskValue(byId.get(d)!);
    out.set(t.id, v);
  }
  return out;
}

/**
 * 의존성을 지키는 개발 순서 (위상 정렬).
 * 실행 가능한(선행 완료) Task 중 "뒤를 풀어주는 중요도 합"이 큰 것, 같으면 사용량이 작은 것부터.
 */
export function orderTasks(tasks: AnalyzedTask[]): AnalyzedTask[] {
  const ids = new Set(tasks.map((t) => t.id));
  const crit = criticality(tasks);
  const placed = new Set<string>();
  const result: AnalyzedTask[] = [];
  let pending = tasks.map((t, i) => ({ t, i }));

  while (pending.length) {
    const ready = pending.filter(({ t }) => t.dependsOn.every((d) => placed.has(d) || !ids.has(d)));
    if (!ready.length) break; // sanitizeTasks를 거치면 도달하지 않음
    ready.sort(
      (a, b) =>
        crit.get(b.t.id)! - crit.get(a.t.id)! ||
        taskCost(a.t) - taskCost(b.t) ||
        b.t.importance - a.t.importance ||
        a.i - b.i,
    );
    const next = ready[0];
    result.push(next.t);
    placed.add(next.t.id);
    pending = pending.filter((p) => p !== next);
  }
  return result;
}

/** "왜 이 순서인가"에 대한 짧은 설명 */
function explainOrder(task: AnalyzedTask, scope: AnalyzedTask[], desc: Map<string, Set<string>>): string {
  const byId = new Map(scope.map((t) => [t.id, t]));
  const parts: string[] = [];
  const deps = task.dependsOn.filter((d) => byId.has(d)).map((d) => `"${byId.get(d)!.name}"`);
  if (deps.length) parts.push(`선행 조건 ${deps.join(", ")} 이후 진행`);
  const unlocks = desc.get(task.id)?.size ?? 0;
  if (unlocks > 0) parts.push(`뒤따르는 ${unlocks}개 기능의 기반`);
  if (task.importance >= 4) parts.push("중요도가 높아 우선 배치");
  else if (task.importance <= 2) parts.push("중요도가 상대적으로 낮아 후순위");
  if (!parts.length) parts.push("다른 기능과 독립적인 기능");
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// 4. Option A — 예산 안에서 중요도 가중치 합을 최대화하는 MVP 선택
// ---------------------------------------------------------------------------

/** 탐색 노드 상한. 초과하면 그때까지 찾은 최선(그리디 시드 이상)을 사용한다. */
const SEARCH_NODE_LIMIT = 400_000;

/**
 * 선행 관계 제약이 있는 배낭 문제.
 * 선택 집합은 반드시 의존성에 대해 닫혀 있어야 한다(선행 기능 없이 후행 기능을 넣을 수 없음).
 * 위상 순서로 포함/제외를 분기하며, 의존성을 무시한 분수 배낭 상한으로 가지치기한다.
 * (Task 수가 수십 개 이하인 PRD 규모에서는 정확해, 더 커지면 그리디 시드 이상을 보장)
 */
export function selectMvp(tasks: AnalyzedTask[], budget: number): MvpPlan {
  const ordered = orderTasks(tasks);
  const n = ordered.length;
  const idx = new Map(ordered.map((t, i) => [t.id, i]));
  const costs = ordered.map(taskCost);
  const values = ordered.map(taskValue);
  const deps = ordered.map((t) => t.dependsOn.filter((d) => idx.has(d)).map((d) => idx.get(d)!));

  // --- 그리디 시드: 선행 기능까지 묶은 "패키지"의 중요도 가중치/사용량 비율이 가장 좋은 것부터 ---
  const closureOf = (j: number, chosen: boolean[]): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();
    const stack = [j];
    while (stack.length) {
      const k = stack.pop()!;
      if (seen.has(k) || chosen[k]) continue;
      seen.add(k);
      out.push(k);
      stack.push(...deps[k]);
    }
    return out;
  };

  let best = { value: 0, cost: 0, chosen: new Array<boolean>(n).fill(false) };
  {
    const chosen = new Array<boolean>(n).fill(false);
    let used = 0;
    let value = 0;
    for (;;) {
      let pick: number[] | null = null;
      let pickRatio = -1;
      for (let j = 0; j < n; j++) {
        if (chosen[j]) continue;
        const pkg = closureOf(j, chosen);
        const c = pkg.reduce((s, k) => s + costs[k], 0);
        if (used + c > budget + EPS) continue;
        const v = pkg.reduce((s, k) => s + values[k], 0);
        if (v / c > pickRatio) {
          pickRatio = v / c;
          pick = pkg;
        }
      }
      if (!pick) break;
      for (const k of pick) {
        chosen[k] = true;
        used += costs[k];
        value += values[k];
      }
    }
    best = { value, cost: used, chosen: [...chosen] };
  }

  // --- 분기 한정 ---
  const byDensity = [...Array(n).keys()].sort((a, b) => values[b] / costs[b] - values[a] / costs[a]);
  const bound = (from: number, room: number, value: number) => {
    let v = value;
    for (const j of byDensity) {
      if (j < from) continue;
      if (costs[j] <= room + EPS) {
        v += values[j];
        room -= costs[j];
      } else {
        v += (values[j] * Math.max(0, room)) / costs[j];
        break;
      }
    }
    return v;
  };

  const current = new Array<boolean>(n).fill(false);
  let nodes = 0;
  const dfs = (i: number, used: number, value: number) => {
    if (++nodes > SEARCH_NODE_LIMIT) return;
    if (i === n) {
      if (value > best.value + EPS || (Math.abs(value - best.value) <= EPS && used < best.cost - EPS)) {
        best = { value, cost: used, chosen: [...current] };
      }
      return;
    }
    if (bound(i, budget - used, value) <= best.value + EPS) return;
    if (used + costs[i] <= budget + EPS && deps[i].every((d) => current[d])) {
      current[i] = true;
      dfs(i + 1, used + costs[i], value + values[i]);
      current[i] = false;
    }
    dfs(i + 1, used, value);
  };
  dfs(0, 0, 0);

  // --- 결과 조립 ---
  const includedTasks = orderTasks(ordered.filter((_, i) => best.chosen[i]));
  const includedIds = new Set(includedTasks.map((t) => t.id));
  const desc = descendantsOf(includedTasks);
  const included: PlannedTask[] = includedTasks.map((task, i) => ({
    task,
    cost: taskCost(task),
    order: i + 1,
    reason: explainOrder(task, includedTasks, desc),
  }));

  const usedExpected = round1(included.reduce((s, p) => s + p.cost, 0));
  const remaining = budget - usedExpected;
  const fullClosureCost = (t: AnalyzedTask) => {
    const chosen = ordered.map((o) => includedIds.has(o.id));
    return closureOf(idx.get(t.id)!, chosen).reduce((s, k) => s + costs[k], 0);
  };

  const excludedNames = new Map(ordered.filter((t) => !includedIds.has(t.id)).map((t) => [t.id, t.name]));
  const excluded: ExcludedTask[] = ordered
    .filter((t) => !includedIds.has(t.id))
    .map((task) => {
      const cost = taskCost(task);
      const blocker = task.dependsOn.find((d) => excludedNames.has(d));
      let reason: string;
      if (blocker) {
        reason = `선행 기능 "${excludedNames.get(blocker)}"이(가) 이번 MVP에서 빠져 함께 다음 단계로 미룸`;
      } else if (cost > budget + EPS) {
        reason = `이 기능 하나만으로 사용 가능한 사용량(${budget})을 넘음`;
      } else if (task.importance <= 2) {
        reason = `중요도(${task.importance}/5) 대비 예상 사용량(${cost})이 커서 우선순위가 낮음`;
      } else {
        const needed = round1(fullClosureCost(task));
        reason =
          needed > remaining + EPS
            ? `선행 기능까지 포함하려면 사용량 약 ${needed}만큼 필요하지만 남은 예산은 ${round1(remaining)}뿐임`
            : "중요도 합이 더 높은 다른 기능 조합을 우선함";
      }
      return { task, cost, reason };
    });

  const totalValue = ordered.reduce((s, t) => s + taskValue(t), 0);
  const capturedValue = includedTasks.reduce((s, t) => s + taskValue(t), 0);
  const usedMin = round1(includedTasks.reduce((s, t) => s + t.usageMin, 0));
  const usedMax = round1(includedTasks.reduce((s, t) => s + t.usageMax, 0));

  return {
    included,
    excluded,
    budget,
    usedExpected,
    usedMin,
    usedMax,
    utilization: budget > 0 ? usedExpected / budget : 0,
    valueCaptured: totalValue > 0 ? capturedValue / totalValue : 0,
    fitsWorstCase: usedMax <= budget + EPS,
  };
}

// ---------------------------------------------------------------------------
// 5. Option B — 여러 세션에 걸친 단계적 개발
// ---------------------------------------------------------------------------

/**
 * 전체 Task를 유지한 채 세션별 용량에 맞춰 분배한다.
 * 각 세션에서 (선행이 끝난) 실행 가능 Task를 우선순위 순으로 first-fit 하며,
 * 세션 용량보다 큰 Task는 여러 세션에 나눠 진행한다.
 */
export function planPhased(tasks: AnalyzedTask[], firstCapacity: number, capacity: number): PhasedPlan {
  const ordered = orderTasks(tasks);
  const ids = new Set(ordered.map((t) => t.id));
  const rank = new Map(ordered.map((t, i) => [t.id, i]));
  const desc = descendantsOf(ordered);
  const remaining = new Map(ordered.map((t) => [t.id, taskCost(t)]));
  const started = new Set<string>();
  const done = new Set<string>();
  const orderNo = new Map<string, number>();
  const totalValue = ordered.reduce((s, t) => s + taskValue(t), 0);
  const totalExpected = round1(ordered.reduce((s, t) => s + taskCost(t), 0));

  const sessions: DevSession[] = [];
  let doneValue = 0;

  while (done.size < ordered.length && sessions.length < 200) {
    const cap = sessions.length === 0 ? firstCapacity : capacity;
    let left = cap;
    const items: SessionItem[] = [];

    for (;;) {
      const ready = ordered
        .filter((t) => !done.has(t.id) && t.dependsOn.every((d) => done.has(d) || !ids.has(d)))
        .sort(
          (a, b) =>
            Number(started.has(b.id)) - Number(started.has(a.id)) || rank.get(a.id)! - rank.get(b.id)!,
        );
      if (!ready.length) break;

      let pick = ready.find((t) => remaining.get(t.id)! <= left + EPS);
      let allocated: number;
      if (pick) {
        allocated = remaining.get(pick.id)!;
      } else if (items.length === 0) {
        // 빈 세션 용량보다도 큰 Task: 나눠서 진행
        pick = ready[0];
        allocated = Math.min(left, remaining.get(pick.id)!);
      } else {
        break;
      }

      const rest = round1(remaining.get(pick.id)! - allocated);
      remaining.set(pick.id, rest);
      left = round1(left - allocated);
      started.add(pick.id);
      const completes = rest <= EPS;
      if (completes) {
        done.add(pick.id);
        doneValue += taskValue(pick);
      }
      if (!orderNo.has(pick.id)) orderNo.set(pick.id, orderNo.size + 1);
      items.push({
        task: pick,
        allocated: round1(allocated),
        completes,
        order: orderNo.get(pick.id)!,
        reason: explainOrder(pick, ordered, desc),
      });
      if (left <= EPS) break;
    }

    if (!items.length) break; // 진행 불가 방어
    const used = round1(items.reduce((s, it) => s + it.allocated, 0));
    sessions.push({
      index: sessions.length + 1,
      capacity: cap,
      used,
      remaining: round1(Math.max(0, cap - used)),
      items,
      cumulativeValue: totalValue > 0 ? doneValue / totalValue : 0,
    });
  }

  // 여러 세션에 걸친 Task의 "n/m" 표기
  const partCount = new Map<string, number>();
  for (const s of sessions) for (const it of s.items) partCount.set(it.task.id, (partCount.get(it.task.id) ?? 0) + 1);
  const partSeen = new Map<string, number>();
  for (const s of sessions) {
    for (const it of s.items) {
      const total = partCount.get(it.task.id)!;
      if (total > 1) {
        const index = (partSeen.get(it.task.id) ?? 0) + 1;
        partSeen.set(it.task.id, index);
        it.part = { index, total };
      }
    }
  }

  return { sessions, totalExpected, firstSessionCapacity: firstCapacity, sessionCapacity: capacity };
}

// ---------------------------------------------------------------------------
// 6. 한 번에 계산
// ---------------------------------------------------------------------------

export interface FullPlan {
  tasks: AnalyzedTask[];
  warnings: string[];
  assessment: UsageAssessment;
  order: PlannedTask[];
  mvp: MvpPlan;
  phased: PhasedPlan;
}

export function buildPlan(input: AnalyzedTask[], budget: number, sessionCapacity: number): FullPlan {
  const { tasks, warnings } = sanitizeTasks(input);
  const assessment = assessUsage(tasks, budget);
  const orderedTasks = orderTasks(tasks);
  const desc = descendantsOf(orderedTasks);
  const order = orderedTasks.map((task, i) => ({
    task,
    cost: taskCost(task),
    order: i + 1,
    reason: explainOrder(task, orderedTasks, desc),
  }));
  return {
    tasks,
    warnings,
    assessment,
    order,
    mvp: selectMvp(tasks, budget),
    phased: planPhased(tasks, budget, sessionCapacity),
  };
}
