import fs from "node:fs";
import path from "node:path";
import { olnHome } from "./paths.js";

/**
 * 도구 내부 상태 (~/.openlabnote/state.json).
 * 불투명·재생성 가능 — 호환 약속 없음, 읽기는 항상 관대하게 (docs/versioning.md §2).
 */
export interface AppState {
  /** 마지막으로 실행된 CLI 버전 — 바뀐 첫 홈 진입에 새 소식을 1회 표시 */
  lastRunVersion?: string;
  /** 마지막 업데이트 확인 시도 시각 (ISO) — 실패해도 일주일간 재시도하지 않는다 */
  updateCheckedAt?: string;
  /** registry에서 마지막으로 본 최신 버전 */
  latestKnownVersion?: string;
}

function statePath(): string {
  return path.join(olnHome(), "state.json");
}

export function loadAppState(): AppState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    // 필드 타입 방어 — 손상된 상태가 이후 로직(버전 비교 등)을 죽이지 않게 문자열만 취한다
    const o = parsed as Record<string, unknown>;
    const out: AppState = {};
    if (typeof o["lastRunVersion"] === "string") out.lastRunVersion = o["lastRunVersion"];
    if (typeof o["updateCheckedAt"] === "string") out.updateCheckedAt = o["updateCheckedAt"];
    if (typeof o["latestKnownVersion"] === "string") out.latestKnownVersion = o["latestKnownVersion"];
    return out;
  } catch {
    return {};
  }
}

export function saveAppState(patch: Partial<AppState>): void {
  try {
    const next = { ...loadAppState(), ...patch };
    fs.mkdirSync(olnHome(), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(next, null, 2) + "\n", "utf8");
  } catch {
    /* 내부 상태 저장 실패는 치명적이지 않다 */
  }
}

/** 첫 실행(상태 없음)이면 현재 버전을 기준점으로 — 신규 설치가 과거 새 소식을 보지 않게 */
export function ensureFirstRunVersion(currentVersion: string): void {
  if (!loadAppState().lastRunVersion) saveAppState({ lastRunVersion: currentVersion });
}
