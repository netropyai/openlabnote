import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { readRawIndex } from "../collect.js";
import { capturePath } from "./captures.js";
import type { Config } from "./config.js";
import { isRemoteEntry, notePath, projectForPath } from "./config.js";
import { enumerateDays, isoToLocalYmd, todayYmd, type Ymd } from "./dates.js";
import { claudeProjectsDir, codexSessionsDir, expandTilde } from "./paths.js";

export interface DayState {
  /** 정본 노트(md)가 존재 */
  written: boolean;
  /** 작업 기록이 존재 (raw index 또는 가벼운 프로브) */
  activity: boolean;
  /** lint 실패로 .draft.md 로 저장된 상태 */
  draft: boolean;
}

export type StateMap = Map<string, Map<Ymd, DayState>>; // projectId → date → state

/**
 * 기간 내 (과제×날짜) 상태를 계산한다.
 * activity는 raw index(정확) ∪ 가벼운 프로브(git 날짜·codex 경로 날짜·claude 세션 근사)의 합집합.
 * 프로브는 근사치 — 정확한 판단은 collect가 한다.
 */
export async function computeStates(cfg: Config, since: Ymd, until: Ymd): Promise<StateMap> {
  const days = enumerateDays(since, until);
  const map: StateMap = new Map();
  for (const p of cfg.projects) {
    const inner = new Map<Ymd, DayState>();
    const index = readRawIndex(p.id);
    for (const day of days) {
      inner.set(day, {
        written: fs.existsSync(notePath(cfg, p.id, day)),
        draft: fs.existsSync(notePath(cfg, p.id, day).replace(/\.md$/, ".draft.md")),
        activity: day in index,
      });
    }
    map.set(p.id, inner);
  }

  probeGit(cfg, since, until, map);
  probeCodex(cfg, since, until, map);
  await probeClaude(cfg, since, until, map);
  probeCaptures(cfg, days, map);
  return map;
}

/** 직접 기록(captures)이 있는 날은 수집 전에도 activity로 표시 */
function probeCaptures(cfg: Config, days: Ymd[], map: StateMap): void {
  for (const project of cfg.projects) {
    for (const day of days) {
      if (fs.existsSync(capturePath(project.id, day))) mark(map, project.id, day);
    }
  }
}

function mark(map: StateMap, projectId: string, day: Ymd): void {
  const state = map.get(projectId)?.get(day);
  if (state) state.activity = true;
}

function probeGit(cfg: Config, since: Ymd, until: Ymd, map: StateMap): void {
  const patterns = cfg.author.gitAuthors.map((a) => a.toLowerCase());
  for (const project of cfg.projects) {
    for (const repo of project.repos) {
      if (isRemoteEntry(repo)) continue; // 원격 활동은 raw index(수집 결과)로만 표시 — 프로브에서 ssh 안 함
      const abs = expandTilde(repo);
      if (!fs.existsSync(path.join(abs, ".git"))) continue;
      // --since 순회 조기중단 회피 (collectors/git.ts와 동일한 이유)
      let res = spawnSync(
        "git",
        ["log", "--no-merges", `--since-as-filter=${since} 00:00:00`, "--pretty=format:%aI|%an"],
        { cwd: abs, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 20_000 },
      );
      if (res.status !== 0 && /since-as-filter/.test(res.stderr || "")) {
        res = spawnSync("git", ["log", "--no-merges", `--since=${since} 00:00:00`, "--pretty=format:%aI|%an"], {
          cwd: abs,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
          timeout: 20_000,
        });
      }
      if (res.status !== 0) continue;
      for (const line of res.stdout.split("\n")) {
        const [iso, author] = line.split("|");
        if (!iso || !author) continue;
        if (!patterns.some((p) => author.toLowerCase().includes(p))) continue;
        const day = isoToLocalYmd(iso);
        if (day && day >= since && day <= until) mark(map, project.id, day);
      }
    }
  }
}

function probeCodex(cfg: Config, since: Ymd, until: Ymd, map: StateMap): void {
  const root = codexSessionsDir();
  if (!fs.existsSync(root)) return;
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(abs, depth + 1);
      else if (e.isFile() && e.name.endsWith(".jsonl")) {
        const m = /(\d{4})\/(\d{2})\/(\d{2})\//.exec(abs.split(path.sep).join("/"));
        if (!m) continue;
        const day = `${m[1]}-${m[2]}-${m[3]}`;
        if (day < since || day > until) continue;
        // cwd를 알아야 과제 매핑 — 첫 줄(session_meta)만 읽는다
        const cwd = readFirstCwd(abs);
        if (!cwd) continue;
        const project = projectForPath(cfg, cwd);
        if (project) mark(map, project.id, day);
      }
    }
  };
  walk(root, 0);
}

function readFirstCwd(fp: string): string | null {
  try {
    const fd = fs.openSync(fp, "r");
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const firstLine = buf.toString("utf8", 0, n).split("\n")[0] ?? "";
    const rec = JSON.parse(firstLine) as { payload?: { cwd?: string } };
    return rec.payload?.cwd ?? null;
  } catch {
    return null;
  }
}

/** claude 세션은 파일 첫 레코드 날짜와 mtime 날짜만 마킹하는 근사 프로브 */
async function probeClaude(cfg: Config, since: Ymd, until: Ymd, map: StateMap): Promise<void> {
  const root = claudeProjectsDir();
  if (!fs.existsSync(root)) return;
  const sinceMs = new Date(`${since}T00:00:00`).getTime();
  for (const dir of fs.readdirSync(root)) {
    const abs = path.join(root, dir);
    let entries: string[];
    try {
      entries = fs.readdirSync(abs);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const fp = path.join(abs, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fp);
      } catch {
        continue;
      }
      if (stat.mtimeMs < sinceMs) continue;
      const head = await readFirstJsonLine(fp);
      if (!head) continue;
      const cwd = head.cwd;
      if (!cwd) continue;
      const project = projectForPath(cfg, cwd);
      if (!project) continue;
      const firstDay = head.timestamp ? isoToLocalYmd(head.timestamp) : null;
      const lastDay = isoToLocalYmd(new Date(stat.mtimeMs).toISOString());
      for (const day of [firstDay, lastDay]) {
        if (day && day >= since && day <= until) mark(map, project.id, day);
      }
    }
  }
}

async function readFirstJsonLine(fp: string): Promise<{ cwd?: string; timestamp?: string } | null> {
  try {
    const rl = readline.createInterface({ input: fs.createReadStream(fp, "utf8") });
    for await (const line of rl) {
      rl.close();
      if (!line.trim()) return null;
      try {
        return JSON.parse(line) as { cwd?: string; timestamp?: string };
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** 기록은 있는데 노트가 없는 (과제, 날짜) 목록 */
export function unwrittenOf(states: StateMap): { projectId: string; date: Ymd }[] {
  const out: { projectId: string; date: Ymd }[] = [];
  for (const [projectId, dates] of states) {
    for (const [date, s] of dates) {
      if (s.activity && !s.written) out.push({ projectId, date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.projectId.localeCompare(b.projectId));
}

/** 날짜별 집계 심볼: ● 전부 작성 · ◐ 일부 작성 · ○ 기록만 · ∅(·) 없음 */
export function daySymbol(states: StateMap, day: Ymd): "full" | "partial" | "activity" | "none" {
  let activity = 0;
  let written = 0;
  for (const dates of states.values()) {
    const s = dates.get(day);
    if (!s) continue;
    if (s.written) written += 1;
    if (s.activity || s.written) activity += 1;
  }
  if (activity === 0) return "none";
  if (written === 0) return "activity";
  return written >= activity ? "full" : "partial";
}

export { todayYmd };
