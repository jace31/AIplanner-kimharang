/**
 * 샘플 PRD(lib/samplePrd.ts)에 대해 미리 준비한 분석 결과.
 * 샘플 PRD로 "분석하기"를 누르면 API를 호출하지 않고 이 데이터를 그대로 보여준다.
 * (API 키가 없거나 무료 사용 한도에 도달했을 때도 전체 화면 흐름을 확인할 수 있다.)
 *
 * 사용량 범위는 LLM 분석 프롬프트의 복잡도별 기준(lib/llm/shared.ts)에 맞춘 예시 값이다.
 */
import type { AnalyzedTask, Level, PrdAnalysis } from "./types";

function task(
  id: string,
  name: string,
  description: string,
  importance: Level,
  complexity: Level,
  usageMin: number,
  usageMax: number,
  confidence: AnalyzedTask["confidence"],
  dependsOn: string[],
): AnalyzedTask {
  return { id, name, description, importance, complexity, usageMin, usageMax, confidence, dependsOn };
}

export const SAMPLE_ANALYSIS: PrdAnalysis = {
  projectName: "스터디메이트",
  summary: "관심사와 일정에 맞는 스터디를 찾고 개설·참여하며, 참여 기록 기반 추천과 출석 통계를 제공하는 스터디 매칭 서비스입니다.",
  source: "sample",
  tasks: [
    task("t1", "데이터베이스 스키마 설계", "사용자, 스터디, 참여 기록 테이블을 설계합니다.", 5, 2, 5, 9, "high", []),
    task("t2", "이메일 회원가입", "이메일로 계정을 만들고 인증합니다.", 5, 2, 5, 10, "high", ["t1"]),
    task("t3", "로그인 및 세션 관리", "이메일 로그인과 세션 유지를 구현합니다.", 5, 2, 5, 10, "high", ["t2"]),
    task("t4", "스터디 개설 및 관리", "스터디를 만들고 상세 정보를 수정·관리합니다.", 5, 3, 10, 17, "medium", ["t3"]),
    task("t5", "스터디 참여 신청 및 승인", "참여를 신청하고 개설자가 승인·거절합니다.", 5, 3, 10, 18, "medium", ["t4"]),
    task("t6", "스터디 검색 및 필터", "주제·지역·시간대별 검색과 필터를 제공합니다.", 4, 3, 10, 16, "medium", ["t4"]),
    task("t7", "학습 시간·출석 통계", "개인 학습 시간과 출석률 대시보드를 만듭니다.", 3, 3, 10, 17, "medium", ["t5"]),
    task("t8", "이메일 알림 및 리마인더", "참여 승인과 모임 리마인더를 이메일로 발송합니다.", 3, 3, 10, 18, "medium", ["t5"]),
    task("t9", "관리자 페이지 및 신고 처리", "신고 처리와 사용자 관리 화면을 구현합니다.", 3, 4, 16, 28, "medium", ["t3", "t5"]),
    task("t10", "AI 맞춤 스터디 추천", "관심사와 참여 기록을 바탕으로 스터디를 추천합니다.", 4, 5, 22, 38, "low", ["t5", "t6"]),
    task("t11", "핵심 흐름 테스트 및 배포", "주요 사용자 흐름 테스트와 배포 설정을 합니다.", 4, 2, 8, 14, "medium", ["t5", "t6"]),
  ],
};
