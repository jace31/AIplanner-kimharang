# AI Development Usage Planner

이미 작성된 PRD를 입력하면 AI 개발 사용량을 추정하고, **내가 가진 제한된 사용량 안에서** MVP 또는 단계적 개발 계획으로 재설계해 주는 웹서비스입니다.

```
PRD → 기능/Task 분석 → 사용량 추정 → 사용량 최적화 → MVP 재설계 / 단계적 개발
```

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 최적화 로직 단위 테스트
```

API 키 없이도 동작합니다(규칙 기반 **간이 분석**). LLM으로 PRD를 분석하려면 `.env.local`에 키를 설정하고 서버를 다시 시작하세요.

```bash
cp .env.example .env.local   # Windows PowerShell: copy .env.example .env.local
```

| Provider | 설정 | 비용 |
| --- | --- | --- |
| **Google AI Studio (Gemini)** | `GEMINI_API_KEY` ([발급](https://aistudio.google.com/apikey)), 선택: `GEMINI_MODEL` (기본 `gemini-3.8-flash`) | 무료 티어 있음 (분당/일일 한도) |
| Anthropic (Claude) | `ANTHROPIC_API_KEY`, 선택: `ANTHROPIC_MODEL` (기본 `claude-opus-5`) | 유료 |

- 둘 다 설정하면 무료 티어가 있는 Gemini를 우선 사용합니다. `LLM_PROVIDER=gemini|anthropic`으로 고정할 수 있습니다.
- ⚠️ **Gemini 무료 티어는 입력 내용이 Google 제품 개선에 사용될 수 있습니다.** 기밀·개인정보가 담긴 PRD는 넣지 마세요. (유료 티어는 사용되지 않는다고 Google이 안내합니다.)
- 키는 서버에서만 사용되며 브라우저로 전달되지 않습니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `lib/optimizer.ts` | **핵심 로직**: 의존성 검증(순환 제거), 위상 정렬 기반 개발 순서, MVP 선택(선행 관계 제약 배낭 문제, 분기 한정 정확해), 세션 분배 |
| `lib/llm/` | 서버 전용. Task 추출·중요도/복잡도/사용량/의존성 추정. `gemini.ts`(REST) / `anthropic.ts`(SDK) / `shared.ts`(공통 프롬프트·스키마·응답 정규화) / `index.ts`(provider 선택) |
| `lib/heuristic.ts` | API 키 없이 쓰는 규칙 기반 간이 분석기 |
| `app/api/analyze/route.ts` | 분석 API (키가 있으면 LLM, 없으면 간이 분석) |
| `components/*`, `app/page.tsx` | 입력 → 현황 → 전략 선택 → 결과 화면 |

## 예상 → 실제 사용량 피드백 (내 데이터로 보정)

개발을 마친 뒤 기능별 실제 사용량을 기록하면, 다음 프로젝트의 예상이 내 개발 방식에 맞게 보정됩니다. API 키가 필요 없고 기록은 브라우저 `localStorage`에만 저장됩니다.

```
로그인  기존 예상 8~12 → 실제 17 기록 → 다음 프로젝트의 로그인 예상 14~20 (×1.7)
```

- `lib/calibration.ts`: 같은 종류의 기능(로그인/login/인증 등)을 매칭해 최근 기록에 가중한 배율을 적용합니다. 기록이 많고 일관될수록 범위가 좁아지고, 같은 종류의 기록이 없는 기능에는 전체 경향만 약하게 반영합니다.
- 배율은 항상 **보정 전 원래 예상** 기준으로 계산해 중첩되지 않게 합니다.
- 화면에서 직접 수정한 기능은 보정에서 제외되며, "보정 사용" 토글로 언제든 끌 수 있습니다.

## 설계 원칙

- **LLM은 추출·추정만**, 사용량 계산·MVP 선택·세션 분배·순서 결정은 애플리케이션 코드가 결정론적으로 수행합니다.
- 사용량 단위는 "한 번의 사용 한도 = 100"인 상대값이며, 사용자마다 다른 한도를 직접 입력합니다.
- 사용량은 항상 **범위 + 신뢰도**로 표시합니다. 계획은 범위의 중앙값 기준으로 세우고, 최대 추정치가 예산을 넘으면 경고합니다.
- 결과 화면에서 중요도·사용량을 고치면 계획이 즉시 다시 계산됩니다(모든 최적화는 클라이언트의 순수 함수).
