/**
 * 사용량 기록 저장소 (브라우저 localStorage). 계정/DB 없이 이 기기에만 저장된다.
 * React에서는 useSyncExternalStore(subscribeRecords, getRecords, getServerRecords)로 구독한다.
 * getRecords는 저장된 문자열이 바뀌지 않는 한 같은 배열 참조를 돌려줘야 한다.
 */
import { isValidRecord, upsertRecords, type UsageRecord } from "./calibration";

const KEY = "usage-planner:records:v1";
const EMPTY: UsageRecord[] = [];

let lastRaw: string | null | undefined;
let lastParsed: UsageRecord[] = EMPTY;
/** localStorage를 쓸 수 없는 환경(사생활 모드 등)에서는 이번 방문 동안만 메모리에 유지한다 */
let memoryOnly = false;
const listeners = new Set<() => void>();

function isRecordShape(x: unknown): x is UsageRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.project === "string" &&
    typeof r.taskName === "string" &&
    typeof r.key === "string" &&
    typeof r.estMin === "number" &&
    typeof r.estMax === "number" &&
    typeof r.actual === "number" &&
    typeof r.recordedAt === "number" &&
    isValidRecord(r as unknown as UsageRecord)
  );
}

export function getRecords(): UsageRecord[] {
  if (memoryOnly) return lastParsed;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return lastParsed;
  }
  if (raw === lastRaw) return lastParsed;
  lastRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed.filter(isRecordShape) : [];
    lastParsed = list.length ? list : EMPTY;
  } catch {
    lastParsed = EMPTY;
  }
  return lastParsed;
}

/** 서버 렌더링 시점 스냅샷 (기록 없음). 클라이언트 첫 렌더도 이 값을 쓰므로 하이드레이션 불일치가 없다. */
export const getServerRecords = (): UsageRecord[] => EMPTY;

export function subscribeRecords(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: UsageRecord[]) {
  const raw = JSON.stringify(next);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    memoryOnly = true;
  }
  lastRaw = raw;
  lastParsed = next.length ? next : EMPTY;
  listeners.forEach((l) => l());
}

export function addRecords(incoming: UsageRecord[]): void {
  write(upsertRecords(getRecords(), incoming));
}

export function removeRecord(id: string): void {
  write(getRecords().filter((r) => r.id !== id));
}

export function clearRecords(): void {
  write([]);
}
