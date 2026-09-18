import { describe, expect, it } from "vitest";
import { heuristicAnalyze } from "./heuristic";
import { buildPlan } from "./optimizer";
import { SAMPLE_PRD } from "./samplePrd";

describe("heuristicAnalyze", () => {
  const analysis = heuristicAnalyze(SAMPLE_PRD);
  const byName = (name: string) => analysis.tasks.find((t) => t.name.includes(name))!;

  it("샘플 PRD에서 10개 기능을 추출하고 메타 정보를 기능으로 착각하지 않는다", () => {
    expect(analysis.tasks).toHaveLength(10);
    expect(analysis.source).toBe("heuristic");
    expect(analysis.projectName).toContain("스터디메이트");
  });

  it("의존성이 정합적이다 (순환·잘못된 참조 없음)", () => {
    const plan = buildPlan(analysis.tasks, 50, 50);
    expect(plan.warnings).toEqual([]);
    expect(plan.order).toHaveLength(10);
  });

  it("기반 기능이 먼저 오고 배포는 핵심 기능 뒤에 온다", () => {
    const plan = buildPlan(analysis.tasks, 50, 50);
    const pos = (name: string) => plan.order.find((p) => p.task.name.includes(name))!.order;
    expect(pos("DB")).toBeLessThan(pos("회원가입"));
    expect(pos("회원가입")).toBeLessThan(pos("로그인"));
    expect(pos("로그인")).toBeLessThan(pos("스터디 생성"));
    expect(pos("스터디 생성")).toBeLessThan(pos("스터디 검색"));
    expect(pos("스터디 생성")).toBeLessThan(pos("테스트 및 배포"));
  });

  it("키워드로 중요도/복잡도를 추정한다", () => {
    expect(byName("AI 추천").complexity).toBe(5);
    expect(byName("로그인").importance).toBe(5);
    expect(byName("통계").importance).toBeLessThanOrEqual(2);
  });

  it("'feedback'·'author' 같은 단어를 DB/인증으로 오인하지 않는다", () => {
    const a = heuristicAnalyze("- feedback board: users post feedback\n- author profile: shows author bio\n- reports: monthly report");
    // DB/인증 규칙(복잡도 2)이 아니라 일반 기능(복잡도 3)으로 분류되어야 한다
    expect(a.tasks.find((t) => t.name.startsWith("feedback"))!.complexity).toBe(3);
    expect(a.tasks.find((t) => t.name.startsWith("author"))!.complexity).toBe(3);
  });
});
