import fs from "node:fs";
import path from "node:path";
import { isRemoteEntry, type Config } from "../lib/config.js";
import { expandTilde } from "../lib/paths.js";
import { fromYmd, addDays, toYmd, type Ymd } from "../lib/dates.js";
import type { CollectRange } from "./types.js";

/** 그날 수정된 이미지·영상 후보 — 디렉토리 단위로 묶어 데이터셋 프레임 폭주를 막는다 (METHOD 교훈) */
export interface MediaGroup {
  dir: string;
  /** 대표 파일 (그날 가장 최근 수정) */
  rep: string;
  count: number;
  /** count ≤ 3 일 때만 전체 나열 */
  files: string[];
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov"]);
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "out",
  ".next", "target", ".cache", ".openlabnote",
]);
const MAX_VISITS = 30_000;
const MAX_DEPTH = 5;
const MAX_GROUPS_PER_DAY = 6;

/** 과제의 로컬 경로들에서 기간 내 수정된 미디어 파일을 수집 (원격 항목은 제외) */
export function collectMedia(cfg: Config, range: CollectRange): Map<string, Map<Ymd, MediaGroup[]>> {
  const sinceMs = fromYmd(range.since).getTime();
  const untilMs = fromYmd(addDays(range.until, 1)).getTime();
  const out = new Map<string, Map<Ymd, MediaGroup[]>>();

  for (const project of cfg.projects) {
    // (day, dir) → {path, mtime}[]
    const buckets = new Map<string, { p: string; m: number }[]>();
    let visits = 0;

    const walk = (dir: string, depth: number): void => {
      if (visits > MAX_VISITS || depth > MAX_DEPTH) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (visits++ > MAX_VISITS) return;
        if (e.name.startsWith(".") && e.isDirectory()) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) walk(abs, depth + 1);
          continue;
        }
        const ext = path.extname(e.name).toLowerCase();
        if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) continue;
        let st: fs.Stats;
        try {
          st = fs.statSync(abs);
        } catch {
          continue;
        }
        if (st.mtimeMs < sinceMs || st.mtimeMs >= untilMs) continue;
        const day = toYmd(new Date(st.mtimeMs));
        const key = `${day}|${dir}`;
        const list = buckets.get(key) ?? [];
        list.push({ p: abs, m: st.mtimeMs });
        buckets.set(key, list);
      }
    };

    for (const entry of [...project.repos, ...project.dirs]) {
      if (isRemoteEntry(entry)) continue;
      const abs = expandTilde(entry);
      if (fs.existsSync(abs)) walk(abs, 0);
    }

    const byDay = new Map<Ymd, MediaGroup[]>();
    for (const [key, files] of buckets) {
      const [day, dir] = [key.slice(0, 10) as Ymd, key.slice(11)];
      files.sort((a, b) => b.m - a.m);
      const groups = byDay.get(day) ?? [];
      groups.push({
        dir,
        rep: files[0]!.p,
        count: files.length,
        files: files.length <= 3 ? files.map((f) => f.p) : [],
      });
      byDay.set(day, groups);
    }
    for (const [day, groups] of byDay) {
      groups.sort((a, b) => b.count - a.count);
      byDay.set(day, groups.slice(0, MAX_GROUPS_PER_DAY));
    }
    if (byDay.size > 0) out.set(project.id, byDay);
  }
  return out;
}
