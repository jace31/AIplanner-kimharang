/**
 * 사용량 단위: "한 번의 AI 개발 사용 한도(세션)를 100으로 봤을 때의 상대값".
 * 실제 Claude Code 한도는 사용자마다 다르므로 토큰이 아닌 추상 단위를 쓴다.
 */

export type Level = 1 | 2 | 3 | 4 | 5;
export type Confidence = "low" | "medium" | "high";

/** PRD에서 추출된 개발 Task 하나 (LLM 또는 간이 분석 결과) */
export interface AnalyzedTask {
  id: string;
  name: string;
  description: string;
  /** 중요도 = 사용자에게 얼마나 핵심적인가 (5가 가장 높음) */
  importance: Level;
  /** 구현 복잡도 (5가 가장 복잡함) */
  complexity: Level;
  /** 예상 AI 개발 사용량 범위 */
  usageMin: number;
  usageMax: number;
  confidence: Confidence;
  /** 선행되어야 하는 Task id 목록 */
  dependsOn: string[];
}

export interface PrdAnalysis {
  projectName: string;
  summary: string;
  tasks: AnalyzedTask[];
  /** 분석 방식: LLM / 규칙 기반 간이 분석 / 샘플 PRD용으로 미리 준비한 결과(API 호출 없음) */
  source: "llm" | "heuristic" | "sample";
  provider?: "gemini" | "anthropic";
  model?: string;
}

export type UsageStatus = "sufficient" | "tight" | "insufficient";

export interface UsageAssessment {
  totalMin: number;
  totalMax: number;
  totalExpected: number;
  budget: number;
  status: UsageStatus;
  /** 기대값 기준 부족분 (부족하지 않으면 0) */
  shortfall: number;
}

export interface PlannedTask {
  task: AnalyzedTask;
  /** 기대 사용량 (범위의 중앙값) */
  cost: number;
  /** 개발 순서 (1부터) */
  order: number;
  /** 이 순서에 놓인 이유 */
  reason: string;
}

export interface ExcludedTask {
  task: AnalyzedTask;
  cost: number;
  reason: string;
}

export interface MvpPlan {
  included: PlannedTask[];
  excluded: ExcludedTask[];
  budget: number;
  usedExpected: number;
  usedMin: number;
  usedMax: number;
  /** 예산 대비 사용률 (0~1+) */
  utilization: number;
  /** 전체 PRD의 중요도 가중치 합 중 MVP가 확보한 비율 (0~1) */
  valueCaptured: number;
  /** 최악(상한) 기준으로도 예산 안에 들어오는지 */
  fitsWorstCase: boolean;
}

export interface SessionItem {
  task: AnalyzedTask;
  /** 이 세션에 배정된 사용량 */
  allocated: number;
  /** 큰 Task를 여러 세션에 나눌 때의 진행 표시 */
  part?: { index: number; total: number };
  /** 이 세션에서 Task가 완료되는지 */
  completes: boolean;
  order: number;
  reason: string;
}

export interface DevSession {
  index: number;
  capacity: number;
  used: number;
  remaining: number;
  items: SessionItem[];
  /** 이 세션까지 누적 확보된 중요도 가중치 비율 (0~1) */
  cumulativeValue: number;
}

export interface PhasedPlan {
  sessions: DevSession[];
  totalExpected: number;
  firstSessionCapacity: number;
  sessionCapacity: number;
}

export interface PlanWarnings {
  messages: string[];
}
