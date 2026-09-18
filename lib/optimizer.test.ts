import { describe, expect, it } from "vitest";
import {
  assessUsage,
  buildPlan,
  orderTasks,
  planPhased,
  sanitizeTasks,
  selectMvp,
  taskCost,
  taskValue,
} from "./optimizer";
import type { AnalyzedTask, Level } from "./types";

function task(
  id: string,
  opts: Partial<Omit<AnalyzedTask, "id">> & { cost?: number } = {},
): AnalyzedTask {
  const cost = opts.cost ?? 10;
  return {
    id,
    name: opts.name ?? id,
    description: "",
    importance: opts.importance ?? 3,
    complexity: opts.complexity ?? 3,
    usageMin: opts.usageMin ?? cost,
    usageMax: opts.usageMax ?? cost,
    confidence: "medium",
    dependsOn: opts.dependsOn ?? [],
  };
}

/** 시드 기반 난수 (재현 가능한 property test용) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("sanitizeTasks", () => {
  it("존재하지 않는 선행 기능과 자기 참조를 제거한다", () => {
    const { tasks, warnings } = sanitizeTasks([task("a", { dependsOn: ["a", "ghost"] }), task("b")]);
    expect(tasks[0].dependsOn).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("순환 의존성을 끊어 DAG로 만든다", () => {
    const { tasks, warnings } = sanitizeTasks([
      task("a", { dependsOn: ["c"] }),
      task("b", { dependsOn: ["a"] }),
      task("c", { dependsOn: ["b"] }),
    ]);
    expect(warnings.some((w) => w.includes("순환"))).toBe(true);
    // 정렬이 모든 Task를 배치할 수 있어야 한다
    expect(orderTasks(tasks)).toHaveLength(3);
  });

  it("사용량 범위를 보정하고 입력을 변경하지 않는다", () => {
    const input = [task("a", { usageMin: 20, usageMax: 10 })];
    const { tasks } = sanitizeTasks(input);
    expect(tasks[0].usageMin).toBe(10);
    expect(tasks[0].usageMax).toBe(20);
    expect(input[0].usageMin).toBe(20);
  });
});

describe("assessUsage", () => {
  const tasks = [task("a", { usageMin: 20, usageMax: 40 }), task("b", { usageMin: 10, usageMax: 20 })];
  it("기대값이 예산을 넘으면 insufficient", () => {
    const a = assessUsage(tasks, 40);
    expect(a.status).toBe("insufficient");
    expect(a.totalExpected).toBe(45);
    expect(a.shortfall).toBe(5);
  });
  it("기대값은 들어가지만 상한은 넘으면 tight", () => {
    expect(assessUsage(tasks, 50).status).toBe("tight");
  });
  it("상한까지 들어가면 sufficient", () => {
    expect(assessUsage(tasks, 60).status).toBe("sufficient");
  });
});

describe("orderTasks", () => {
  it("선행 기능이 항상 먼저 온다", () => {
    const ordered = orderTasks([
      task("ui", { dependsOn: ["api"], importance: 5 }),
      task("api", { dependsOn: ["db"], importance: 1 }),
      task("db", { importance: 1 }),
    ]).map((t) => t.id);
    expect(ordered).toEqual(["db", "api", "ui"]);
  });

  it("독립 Task끼리는 뒤를 풀어주는 중요도 합이 큰 것을 먼저 둔다", () => {
    const ordered = orderTasks([
      task("lonely", { importance: 3 }),
      task("base", { importance: 3 }),
      task("child", { importance: 3, dependsOn: ["base"] }),
    ]).map((t) => t.id);
    expect(ordered.indexOf("base")).toBeLessThan(ordered.indexOf("lonely"));
  });
});

describe("selectMvp", () => {
  it("중요도 높은 기능이 비싼 선행 기능에 묶여 있으면 그 패키지 비용을 함께 계산한다", () => {
    // 중요한 기능 X(중요도 가중치 10, 사용량 5)는 비싼 기반 F(사용량 40)에 의존한다.
    // 단순히 "싼 것부터" 고르면 X를 못 넣지만, 예산 50에서는 F+X가 최선이 아닐 수도 있다.
    const tasks = [
      task("F", { importance: 1, cost: 40 }),
      task("X", { importance: 5, cost: 5, dependsOn: ["F"] }),
      task("A", { importance: 4, cost: 25 }),
      task("B", { importance: 4, cost: 25 }),
    ];
    const mvp = selectMvp(tasks, 50);
    const ids = mvp.included.map((p) => p.task.id).sort();
    // A+B = 중요도 가중치 합 14, F+X = 11 → A+B가 더 낫다
    expect(ids).toEqual(["A", "B"]);
    // F 없이 X만 들어가는 일은 없다
    expect(ids.includes("X")).toBe(false);
    const x = mvp.excluded.find((e) => e.task.id === "X")!;
    expect(x.reason).toContain("선행");
  });

  it("예산이 충분하면 전부 포함한다", () => {
    const mvp = selectMvp([task("a"), task("b", { dependsOn: ["a"] })], 100);
    expect(mvp.included).toHaveLength(2);
    expect(mvp.excluded).toHaveLength(0);
    expect(mvp.valueCaptured).toBe(1);
  });

  it("예산 0에 가까우면 아무것도 넣지 않고 설명 가능한 제외 사유를 준다", () => {
    const mvp = selectMvp([task("a", { cost: 30 })], 10);
    expect(mvp.included).toHaveLength(0);
    expect(mvp.excluded[0].reason).toContain("넘음");
  });

  it("무작위 DAG에서 완전탐색 최적해와 중요도 가중치 합이 같고 의존성에 대해 닫혀 있다", () => {
    const rand = rng(42);
    for (let trial = 0; trial < 150; trial++) {
      const n = 3 + Math.floor(rand() * 8); // 3~10
      const tasks: AnalyzedTask[] = [];
      for (let i = 0; i < n; i++) {
        const deps: string[] = [];
        for (let j = 0; j < i; j++) if (rand() < 0.3) deps.push(`t${j}`);
        tasks.push(
          task(`t${i}`, {
            importance: (1 + Math.floor(rand() * 5)) as Level,
            cost: 3 + Math.floor(rand() * 25),
            dependsOn: deps,
          }),
        );
      }
      const budget = 15 + Math.floor(rand() * 60);

      // 완전탐색
      let bestValue = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        let cost = 0;
        let value = 0;
        let closed = true;
        for (let i = 0; i < n && closed; i++) {
          if (!(mask & (1 << i))) continue;
          cost += taskCost(tasks[i]);
          value += taskValue(tasks[i]);
          for (const d of tasks[i].dependsOn) {
            if (!(mask & (1 << Number(d.slice(1))))) closed = false;
          }
        }
        if (closed && cost <= budget + 1e-9) bestValue = Math.max(bestValue, value);
      }

      const mvp = selectMvp(tasks, budget);
      const chosen = new Set(mvp.included.map((p) => p.task.id));
      const got = mvp.included.reduce((s, p) => s + taskValue(p.task), 0);

      expect(got, `trial ${trial}`).toBe(bestValue);
      expect(mvp.usedExpected).toBeLessThanOrEqual(budget + 1e-9);
      for (const p of mvp.included) for (const d of p.task.dependsOn) expect(chosen.has(d)).toBe(true);
      // 개발 순서도 의존성 순서를 지킨다
      const pos = new Map(mvp.included.map((p) => [p.task.id, p.order]));
      for (const p of mvp.included) for (const d of p.task.dependsOn) expect(pos.get(d)!).toBeLessThan(p.order);
    }
  });
});

describe("planPhased", () => {
  it("모든 Task를 배치하고 세션 용량과 의존 순서를 지킨다", () => {
    const tasks = [
      task("db", { cost: 15, importance: 5 }),
      task("auth", { cost: 12, importance: 5, dependsOn: ["db"] }),
      task("core", { cost: 20, importance: 5, dependsOn: ["auth"] }),
      task("ai", { cost: 25, importance: 4, dependsOn: ["core"] }),
      task("stats", { cost: 15, importance: 2, dependsOn: ["core"] }),
      task("admin", { cost: 10, importance: 2, dependsOn: ["auth"] }),
    ];
    const plan = planPhased(tasks, 50, 50);
    const doneAt = new Map<string, number>();
    for (const s of plan.sessions) {
      expect(s.used).toBeLessThanOrEqual(s.capacity + 1e-9);
      for (const it of s.items) if (it.completes) doneAt.set(it.task.id, s.index);
    }
    expect(doneAt.size).toBe(tasks.length);
    for (const t of tasks) for (const d of t.dependsOn) expect(doneAt.get(d)!).toBeLessThanOrEqual(doneAt.get(t.id)!);
    expect(plan.sessions.at(-1)!.cumulativeValue).toBeCloseTo(1);
    // 핵심 기능(중요도 5)이 첫 세션에 들어간다
    const first = plan.sessions[0].items.map((i) => i.task.id);
    expect(first).toEqual(expect.arrayContaining(["db", "auth", "core"]));
  });

  it("세션 용량보다 큰 Task는 여러 세션으로 나눈다", () => {
    const plan = planPhased([task("huge", { cost: 70 }), task("tail", { cost: 5, dependsOn: ["huge"] })], 50, 50);
    const huge = plan.sessions.flatMap((s) => s.items).filter((i) => i.task.id === "huge");
    expect(huge.length).toBe(2);
    expect(huge[0].completes).toBe(false);
    expect(huge[1].completes).toBe(true);
    expect(huge[0].part).toEqual({ index: 1, total: 2 });
    expect(huge.reduce((s, i) => s + i.allocated, 0)).toBeCloseTo(70);
    // 후행 Task는 huge가 끝난 세션 이후에만 시작한다
    const tailSession = plan.sessions.find((s) => s.items.some((i) => i.task.id === "tail"))!;
    const hugeDone = plan.sessions.find((s) => s.items.some((i) => i.task.id === "huge" && i.completes))!;
    expect(tailSession.index).toBeGreaterThanOrEqual(hugeDone.index);
  });

  it("첫 세션 용량과 이후 세션 용량을 따로 적용한다", () => {
    const tasks = [task("a", { cost: 20 }), task("b", { cost: 20 }), task("c", { cost: 20 })];
    const plan = planPhased(tasks, 20, 40);
    expect(plan.sessions[0].capacity).toBe(20);
    expect(plan.sessions[1].capacity).toBe(40);
    expect(plan.sessions).toHaveLength(2);
  });
});

describe("buildPlan", () => {
  it("순환·잘못된 참조가 섞인 입력에서도 끝까지 계산된다", () => {
    const plan = buildPlan(
      [task("a", { dependsOn: ["b"] }), task("b", { dependsOn: ["a", "zzz"] }), task("c")],
      25,
      25,
    );
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.order).toHaveLength(3);
    expect(plan.phased.sessions.length).toBeGreaterThan(0);
  });
});
