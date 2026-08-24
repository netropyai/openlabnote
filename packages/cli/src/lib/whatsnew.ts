import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAppState, saveAppState } from "./app-state.js";
import { t } from "./i18n.js";
import { compareVersions } from "./update.js";

export interface ReleaseNotes {
  version: string;
  bullets: string[];
}

/** 패키지에 동봉된 CHANGELOG.md (src|dist /lib 기준 두 단계 위 = 패키지 루트) */
function changelogPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "CHANGELOG.md");
}

/** CHANGELOG.md 파싱 — `## x.y.z (…)` 섹션과 그 불릿들 */
export function parseChangelog(text: string): ReleaseNotes[] {
  const out: ReleaseNotes[] = [];
  let cur: ReleaseNotes | null = null;
  for (const line of text.split("\n")) {
    const h = /^##\s+(\d+\.\d+\.\d+)/.exec(line);
    if (h) {
      cur = { version: h[1] as string, bullets: [] };
      out.push(cur);
      continue;
    }
    const b = /^-\s+(.+)$/.exec(line.trim());
    if (b && cur) cur.bullets.push(b[1] as string);
  }
  return out;
}

/** prev(비포함) < v ≤ current 릴리스들 */
export function releasesBetween(notes: ReleaseNotes[], prev: string, current: string): ReleaseNotes[] {
  return notes.filter(
    (n) => compareVersions(n.version, prev) > 0 && compareVersions(n.version, current) <= 0,
  );
}

export interface WhatsNew {
  title: string;
  bullets: string[];
}

/**
 * 버전이 바뀐 뒤 첫 홈 진입에 1회 보여줄 새 소식 — 호출하면 본 것으로 처리된다.
 * 동봉 CHANGELOG 기반이라 네트워크가 필요 없다. 다운그레이드면 조용히 기준만 갱신.
 */
export function takeWhatsNew(currentVersion: string): WhatsNew | null {
  const st = loadAppState();
  if (!st.lastRunVersion || st.lastRunVersion === currentVersion) return null;
  saveAppState({ lastRunVersion: currentVersion });
  if (compareVersions(currentVersion, st.lastRunVersion) < 0) return null;

  let sections: ReleaseNotes[] = [];
  try {
    sections = releasesBetween(
      parseChangelog(fs.readFileSync(changelogPath(), "utf8")),
      st.lastRunVersion,
      currentVersion,
    );
  } catch {
    /* 동봉 CHANGELOG를 읽지 못하면 제목만 */
  }
  const all = sections.flatMap((s) => s.bullets);
  const bullets = all.slice(0, 6);
  if (all.length > bullets.length) bullets.push(t("… 전체 목록: CHANGELOG.md"));
  return {
    title: t("{from} → {to} 업데이트됨 — 새로워진 것", { from: st.lastRunVersion, to: currentVersion }),
    bullets,
  };
}
