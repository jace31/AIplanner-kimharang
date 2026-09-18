import { describe, expect, it } from "vitest";
import { calibrateTasks, globalRatio, makeRecord, summarizeRecords, taskKey, upsertRecords } from "./calibration";
import type { AnalyzedTask } from "./types";

function task(name: string, min: number, max: number, id = name): AnalyzedTask {
  return {
    id,
    name,
    description: "",
    importance: 3,
    complexity: 3,
    usageMin: min,
    usageMax: max,
    confidence: "low",
    dependsOn: [],
  };
}

const rec = (name: string, min: number, max: number, actual: number, at = 1, project = "P1") =>
  makeRecord({ project, taskName: name, estMin: min, estMax: max, actual, recordedAt: at, id: `${name}-${at}` });

describe("taskKey", () => {
  it("이름이 달라도 같은 종류의 기능은 같은 키를 가진다", () => {
    expect(taskKey("로그인")).toBe(taskKey("Login"));
    expect(taskKey("로그인")).toBe(taskKey("사용자 인증"));
    expect(taskKey("AI 추천")).toBe(taskKey("recommendation engine"));
  });
  it("알려진 종류가 아니면 이름 기반 키", () => {
    expect(taskKey("스터디 생성 및 참여")).toMatch(/^name:/);
  });
});

describe("calibrateTasks", () => {
  it("예시: 로그인 예상 8~12, 실제 17 → 다음 프로젝트 로그인은 14~20", () => {
    const { tasks, calibrations } = calibrateTasks([task("로그인", 8, 12)], [rec("로그인", 8, 12, 17)]);
    expect(tasks[0].usageMin).toBe(14);
    expect(tasks[0].usageMax).toBe(20);
    const c = calibrations.get("로그인")!;
    expect(c.source).toBe("task");
    expect(c.samples).toBe(1);
    expect(c.ratio).toBeCloseTo(1.7);
    expect(c.baseMin).toBe(8);
  });

  it("기존 예상 범위가 다른 프로젝트에서도 배율로 적용된다", () => {
    // 이번 프로젝트의 로그인 예상은 5~10 (중앙 7.5) → ×1.7 ≈ 12.75
    const { tasks } = calibrateTasks([task("Login", 5, 10)], [rec("로그인", 8, 12, 17)]);
    const mid = (tasks[0].usageMin + tasks[0].usageMax) / 2;
    expect(mid).toBeGreaterThan(12);
    expect(mid).toBeLessThan(13.5);
  });

  it("기록이 없는 종류의 기능에는 전체 경향만 약하게 적용한다", () => {
    const { tasks, calibrations } = calibrateTasks([task("통계", 10, 20)], [rec("로그인", 8, 12, 17)]);
    const c = calibrations.get("통계")!;
    expect(c.source).toBe("global");
    // 1건 기록(1.7배)에서 사전 표본으로 당겨져 1보다 크고 1.7보다 훨씬 작다
    expect(c.ratio).toBeGreaterThan(1);
    expect(c.ratio).toBeLessThan(1.3);
    expect(tasks[0].usageMin).toBeGreaterThanOrEqual(10);
  });

  it("기록이 없으면 그대로 반환한다", () => {
    const input = [task("로그인", 8, 12)];
    const { tasks, calibrations } = calibrateTasks(input, []);
    expect(tasks).toBe(input);
    expect(calibrations.size).toBe(0);
  });

  it("최근 기록에 더 큰 가중치를 준다", () => {
    const older = rec("로그인", 10, 10, 10, 1); // 배율 1.0
    const newer = rec("로그인", 10, 10, 20, 2); // 배율 2.0
    const { calibrations } = calibrateTasks([task("로그인", 10, 10)], [older, newer]);
    const r = calibrations.get("로그인")!.ratio;
    expect(r).toBeGreaterThan(Math.sqrt(2)); // 단순 기하평균(√2)보다 최근 쪽으로 치우친다
    expect(r).toBeLessThan(2);
  });

  it("기록이 늘고 일관될수록 범위가 좁아진다", () => {
    const one = calibrateTasks([task("로그인", 10, 10)], [rec("로그인", 10, 10, 15, 1)]).tasks[0];
    const many = calibrateTasks(
      [task("로그인", 10, 10)],
      [1, 2, 3, 4].map((i) => rec("로그인", 10, 10, 15, i)),
    ).tasks[0];
    expect(many.usageMax - many.usageMin).toBeLessThan(one.usageMax - one.usageMin);
    expect(many.confidence).toBe("high"); // 3건 이상이면 신뢰도 상승
  });

  it("기록끼리 들쭉날쭉하면 범위를 넓게 유지한다", () => {
    const steady = calibrateTasks([task("검색", 10, 10)], [1, 2, 3, 4].map((i) => rec("검색", 10, 10, 15, i))).tasks[0];
    const noisy = calibrateTasks(
      [task("검색", 10, 10)],
      [8, 25, 9, 30].map((a, i) => rec("검색", 10, 10, a, i + 1)),
    ).tasks[0];
    expect(noisy.usageMax - noisy.usageMin).toBeGreaterThan(steady.usageMax - steady.usageMin);
  });

  it("skipIds에 든 Task(사용자가 직접 수정한 값)는 보정하지 않는다", () => {
    const input = [task("로그인", 8, 12)];
    const { tasks } = calibrateTasks(input, [rec("로그인", 8, 12, 17)], { skipIds: new Set(["로그인"]) });
    expect(tasks[0]).toBe(input[0]);
  });

  it("입력 Task를 변경하지 않고, 잘못된 기록은 무시한다", () => {
    const input = [task("로그인", 8, 12)];
    const bad = { ...rec("로그인", 8, 12, 17), actual: -3 };
    const { tasks } = calibrateTasks(input, [bad]);
    expect(tasks).toBe(input);
    calibrateTasks(input, [rec("로그인", 8, 12, 17)]);
    expect(input[0].usageMin).toBe(8);
  });

  it("극단적인 배율은 제한한다", () => {
    const { calibrations } = calibrateTasks([task("로그인", 1, 1)], [rec("로그인", 1, 1, 500)]);
    expect(calibrations.get("로그인")!.ratio).toBeLessThanOrEqual(4);
  });
});

describe("globalRatio", () => {
  it("기록이 없으면 1", () => {
    expect(globalRatio([])).toBe(1);
  });

  it("기록 1건(×1.7)이면 사전 표본으로 당겨져 1.7^(1/4) ≈ 1.14 — 도움말에 적힌 예시와 같다", () => {
    expect(globalRatio([rec("로그인", 8, 12, 17)])).toBeCloseTo(Math.pow(1.7, 1 / 4), 10);
    expect(globalRatio([rec("로그인", 8, 12, 17)])).toBeCloseTo(1.14, 2);
  });

  it("기록이 쌓일수록 전체 평균 배율에 가까워진다", () => {
    const few = globalRatio([1].map((i) => rec("로그인", 10, 10, 20, i)));
    const many = globalRatio([1, 2, 3, 4, 5, 6, 7, 8].map((i) => rec("로그인", 10, 10, 20, i)));
    expect(many).toBeGreaterThan(few);
    expect(many).toBeLessThan(2);
  });

  it("calibrateTasks가 기록 없는 종류에 적용하는 배율과 같다", () => {
    const records = [rec("로그인", 8, 12, 17), rec("검색", 10, 10, 15)];
    const { calibrations } = calibrateTasks([task("통계", 10, 20)], records);
    expect(calibrations.get("통계")!.ratio).toBeCloseTo(globalRatio(records), 10);
  });
});

describe("summarizeRecords / upsertRecords", () => {
  it("평균 배율(기하평균)과 개수를 계산한다", () => {
    const s = summarizeRecords([rec("로그인", 10, 10, 20), rec("검색", 10, 10, 5)]);
    expect(s.count).toBe(2);
    expect(s.meanRatio).toBeCloseTo(1, 5); // 2배와 0.5배 → 1
  });

  it("같은 프로젝트의 같은 기능 기록은 덮어쓴다", () => {
    const merged = upsertRecords([rec("로그인", 10, 10, 15, 1)], [rec("로그인", 10, 10, 20, 2), rec("검색", 10, 10, 9, 2)]);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.taskName === "로그인")!.actual).toBe(20);
  });

  it("다른 프로젝트의 같은 기능 기록은 함께 쌓인다", () => {
    const merged = upsertRecords([rec("로그인", 10, 10, 15, 1, "A")], [rec("로그인", 10, 10, 20, 2, "B")]);
    expect(merged).toHaveLength(2);
  });
});
