import fs from "node:fs";
import path from "node:path";
import type { Ymd } from "./dates.js";
import { olnHome } from "./paths.js";

/**
 * 순간 기록(captures) — 사용자가 "이거 기록해"라고 지시한 내용.
 * ~/.openlabnote/captures/<projectId>/<date>.md 에 append되고,
 * 수집 시 raw 최상단 섹션으로 들어가 노트에 반드시 반영된다.
 * raw와 달리 재생성 불가능한 사용자 자산이다 (docs/versioning.md §2 예외).
 */
export function capturesDir(projectId?: string): string {
  const base = path.join(olnHome(), "captures");
  return projectId ? path.join(base, projectId) : base;
}

export function capturePath(projectId: string, day: Ymd): string {
  return path.join(capturesDir(projectId), `${day}.md`);
}

/** 그날의 직접 기록 전문 (없으면 null) */
export function readCaptures(projectId: string, day: Ymd): string | null {
  try {
    const s = fs.readFileSync(capturePath(projectId, day), "utf8").trim();
    return s || null;
  } catch {
    return null;
  }
}

/** 항목 수 — "## HH:MM" 헤더 기준 */
export function countCaptures(projectId: string, day: Ymd): number {
  const s = readCaptures(projectId, day);
  if (!s) return 0;
  return s.split("\n").filter((l) => /^## \d{2}:\d{2}/.test(l)).length;
}

/** 기록 추가 — 그날 누적 항목 수를 반환 */
export function appendCapture(projectId: string, day: Ymd, text: string, hm: string): number {
  fs.mkdirSync(capturesDir(projectId), { recursive: true });
  fs.appendFileSync(capturePath(projectId, day), `## ${hm}\n${text.trim()}\n\n`, "utf8");
  return countCaptures(projectId, day);
}
