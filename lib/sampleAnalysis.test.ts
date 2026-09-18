import { describe, expect, it } from "vitest";
import { buildPlan } from "./optimizer";
import { SAMPLE_ANALYSIS } from "./sampleAnalysis";
import { SAMPLE_PRD, isSamplePrd } from "./samplePrd";

describe("isSamplePrd", () => {
  it("샘플 PRD는 줄바꿈(CRLF)·앞뒤 공백이 달라도 샘플로 인식한다", () => {
    expect(isSamplePrd(SAMPLE_PRD)).toBe(true);
    expect(isSamplePrd(SAMPLE_PRD.replace(/\n/g, "\r\n"))).toBe(true);
    expect(isSamplePrd(`\n\n  ${SAMPLE_PRD}  \n`)).toBe(true);
  });

  it("한 글자라도 고치면 샘플이 아니다(실제 분석 경로를 탄다)", () => {
    expect(isSamplePrd(SAMPLE_PRD + "\n- 공유: 초대 링크")).toBe(false);
    expect(isSamplePrd(SAMPLE_PRD.replace("스터디메이트", "스터디메이트2"))).toBe(false);
    expect(isSamplePrd("")).toBe(false);
  });
});

describe("SAMPLE_ANALYSIS", () => {
  it("샘플 표시가 붙어 있고 API 정보(provider/model)가 없다", () => {
    expect(SAMPLE_ANALYSIS.source).toBe("sample");
    expect(SAMPLE_ANALYSIS.provider).toBeUndefined();
    expect(SAMPLE_ANALYSIS.model).toBeUndefined();
  });

  it("id가 고유하고 의존성 경고(순환·잘못된 참조)가 없다", () => {
    const ids = SAMPLE_ANALYSIS.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const plan = buildPlan(SAMPLE_ANALYSIS.tasks, 50, 50);
    expect(plan.warnings).toEqual([]);
    expect(plan.order).toHaveLength(SAMPLE_ANALYSIS.tasks.length);
  });

  it("사용량은 항상 범위이고(min < max) 값이 유효하다", () => {
    for (const t of SAMPLE_ANALYSIS.tasks) {
      expect(t.usageMin, t.name).toBeGreaterThan(0);
      expect(t.usageMax, t.name).toBeGreaterThan(t.usageMin);
      expect(t.importance).toBeGreaterThanOrEqual(1);
      expect(t.importance).toBeLessThanOrEqual(5);
    }
  });

  it("기본 예산 50에서 '사용량 부족'이 되어 두 전략이 의미 있게 갈린다", () => {
    const plan = buildPlan(SAMPLE_ANALYSIS.tasks, 50, 50);
    expect(plan.assessment.status).toBe("insufficient");
    // MVP는 일부만, 단계적 개발은 여러 세션
    expect(plan.mvp.included.length).toBeGreaterThan(0);
    expect(plan.mvp.excluded.length).toBeGreaterThan(0);
    expect(plan.mvp.usedExpected).toBeLessThanOrEqual(50);
    expect(plan.phased.sessions.length).toBeGreaterThan(1);
    // 핵심 기반 기능(DB → 회원가입 → 로그인)이 MVP에 들어간다
    const inMvp = plan.mvp.included.map((p) => p.task.id);
    expect(inMvp).toEqual(expect.arrayContaining(["t1", "t2", "t3"]));
  });
});
