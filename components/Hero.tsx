import type { ReactNode } from "react";

/** 서비스 흐름의 4단계. 아이콘은 단순한 선 그림(SVG)으로 그린다. */
const STEPS: { label: string; icon: ReactNode }[] = [
  {
    label: "PRD",
    icon: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
      </>
    ),
  },
  {
    label: "사용량 분석",
    icon: (
      <>
        <path d="M4 20h16" />
        <rect x="5.5" y="12" width="3.2" height="6" rx="0.8" />
        <rect x="10.4" y="7" width="3.2" height="11" rx="0.8" />
        <rect x="15.3" y="10" width="3.2" height="8" rx="0.8" />
      </>
    ),
  },
  {
    label: "개발 범위 결정",
    icon: (
      <>
        <path d="M4 7.2l1.8 1.8L9.6 5.2M4 16.2l1.8 1.8 3.8-3.8" />
        <path d="M13 7h7M13 16h7" />
      </>
    ),
  },
  {
    label: "실행 계획",
    icon: <path d="M6 21V4M6 5h11l-2.5 3.5L17 12H6" />,
  },
];

function StepIcon({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-6 w-6 ${light ? "text-white" : "text-indigo-600"}`}
    >
      {children}
    </svg>
  );
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-6 w-6"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** 서비스가 무엇인지 한눈에 보여주는 흐름 그림: PRD → 사용량 분석 → 개발 범위 결정 → 실행 계획 */
function Flow() {
  return (
    <ol aria-label="서비스 흐름" className="mt-7 grid grid-cols-2 gap-3 sm:flex sm:items-stretch sm:gap-0">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="contents">
            <div
              className={`flex flex-1 flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center shadow-sm ${
                last ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-900"
              }`}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  last ? "bg-white/20" : "bg-indigo-50"
                }`}
              >
                <StepIcon light={last}>{s.icon}</StepIcon>
              </span>
              <span className="min-w-0">
                <span className={`block text-[11px] font-bold tracking-wider ${last ? "text-indigo-100" : "text-slate-500"}`}>
                  STEP {i + 1}
                </span>
                <span className="block break-keep text-base font-bold leading-tight">{s.label}</span>
              </span>
            </div>
            {!last && (
              <span aria-hidden className="hidden items-center px-2 text-slate-400 sm:flex">
                <Arrow />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 페이지 상단. 분석 전 첫 화면에서는 소개 문구와 흐름 그림을 크게 보여주고,
 * 분석 후·기록 탭에서는 결과를 밀어내지 않도록 제품명과 한 줄 설명만 남긴다.
 */
export function Hero({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <header className="mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">AI Development Usage Planner</h1>
        <p className="mt-1.5 text-slate-600">
          내가 가진 제한된 AI 개발 사용량으로, 이 PRD를 어디까지 · 어떤 순서로 개발할 수 있을까?
        </p>
      </header>
    );
  }

  return (
    <header className="mb-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">AI Development Usage Planner</h1>

      <p className="mt-5 text-2xl font-extrabold leading-snug text-slate-900 sm:text-3xl">
        PRD는 준비되어 있는데,
        <br className="hidden sm:block" /> <span className="text-indigo-600">AI 개발 사용량이 부족하다면?</span>
      </p>
      <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">
        내 사용량 안에서 무엇을 먼저 개발할지,
        <br className="hidden sm:block" /> 전체 기능을 만들려면 몇 번의 세션이 필요한지 계획해보세요.
      </p>

      <Flow />
    </header>
  );
}
