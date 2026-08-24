import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { t } from "./i18n.js";
import { claudeProjectsDir, codexSessionsDir } from "./paths.js";
import { remoteHome, sshRunAsync } from "./remote.js";

export interface HarnessInfo {
  name: string;
  found: boolean;
  detail: string;
}

export interface RepoCandidate {
  path: string;
  /** 최근 90일 내 마지막 커밋 날짜 (YYYY-MM-DD) */
  lastCommit: string;
}

export interface ScanResult {
  harnesses: HarnessInfo[];
  gitName: string | null;
  gitEmail: string | null;
  repos: RepoCandidate[];
  claudeCliFound: boolean;
  codexCliFound: boolean;
}

/** 하네스 설치·사용 흔적, git author, 활동 리포를 결정적으로 감지 */
export function scanEnvironment(): ScanResult {
  const harnesses: HarnessInfo[] = [];

  // Claude Code
  {
    const dir = claudeProjectsDir();
    let sessions = 0;
    let latest = 0;
    if (fs.existsSync(dir)) {
      for (const d of safeReaddir(dir)) {
        for (const f of safeReaddir(path.join(dir, d))) {
          if (!f.endsWith(".jsonl")) continue;
          sessions += 1;
          const st = safeStat(path.join(dir, d, f));
          if (st && st.mtimeMs > latest) latest = st.mtimeMs;
        }
      }
    }
    harnesses.push({
      name: "Claude Code",
      found: sessions > 0,
      detail: sessions > 0 ? t("세션 {n}개 (최근: {last})", { n: sessions, last: ago(latest) }) : t("사용 흔적 없음"),
    });
  }

  // Codex
  {
    const dir = codexSessionsDir();
    let sessions = 0;
    let latestDate = "";
    if (fs.existsSync(dir)) {
      const walk = (d: string, depth: number): void => {
        for (const e of safeReaddir(d)) {
          const abs = path.join(d, e);
          const st = safeStat(abs);
          if (!st) continue;
          if (st.isDirectory() && depth < 3) walk(abs, depth + 1);
          else if (e.endsWith(".jsonl")) {
            sessions += 1;
            const m = /(\d{4})\/(\d{2})\/(\d{2})\//.exec(abs.split(path.sep).join("/"));
            if (m) {
              const day = `${m[1]}-${m[2]}-${m[3]}`;
              if (day > latestDate) latestDate = day;
            }
          }
        }
      };
      walk(dir, 0);
    }
    harnesses.push({
      name: "Codex",
      found: sessions > 0,
      detail: sessions > 0 ? t("세션 {n}개 (최근: {last})", { n: sessions, last: latestDate }) : t("사용 흔적 없음"),
    });
  }

  // Cursor (감지만 — 수집기는 2단계)
  {
    const dir = path.join(os.homedir(), "Library", "Application Support", "Cursor");
    const found = fs.existsSync(dir);
    harnesses.push({ name: "Cursor", found, detail: found ? t("설치됨 (수집기는 곧 지원)") : t("설치 흔적 없음") });
  }

  const gitName = gitConfig("user.name");
  const gitEmail = gitConfig("user.email");
  const claudeCliFound = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 10_000 }).status === 0;
  const codexCliFound = spawnSync("codex", ["--version"], { encoding: "utf8", timeout: 10_000 }).status === 0;

  return { harnesses, gitName, gitEmail, repos: discoverRepos(), claudeCliFound, codexCliFound };
}

const RECENT_DAYS = 90;

/** ~/.ssh/config 의 Host 별칭 목록 (와일드카드 제외) */
export function listSshHosts(): string[] {
  const fp = path.join(os.homedir(), ".ssh", "config");
  if (!fs.existsSync(fp)) return [];
  const out: string[] = [];
  try {
    for (const line of fs.readFileSync(fp, "utf8").split("\n")) {
      const m = /^\s*Host\s+(.+)$/i.exec(line);
      if (!m) continue;
      for (const token of (m[1] ?? "").trim().split(/\s+/)) {
        if (!token || /[*?!]/.test(token)) continue;
        if (!out.includes(token)) out.push(token);
      }
    }
  } catch {
    return [];
  }
  return out;
}

export interface RemoteRepoCandidate {
  /** "호스트:절대경로" — config 항목으로 그대로 사용 가능 */
  entry: string;
  /** 표시용 경로 (원격 ~ 축약) */
  display: string;
  lastCommit: string;
}

/** 원격 서버 홈(깊이 4)에서 최근 활동 git 리포 발굴 (ssh 1회, find 기반 — 무거운 폴더 제외) */
export async function discoverRemoteRepos(host: string): Promise<RemoteRepoCandidate[]> {
  // 숨김(.git 제외)·node_modules·macOS 대형 폴더는 prune, .git 발견 시 내부 미탐색
  const heavy = "-name 'node_modules' -o -name 'Library' -o -name 'Applications' -o -name 'Movies' -o -name 'Music' -o -name 'Pictures' -o -name 'go' -o -name 'venv' -o -name '.*' ! -name '.git'";
  const script =
    `find "$HOME" -mindepth 1 -maxdepth 5 ` +
    `\\( \\( ${heavy} \\) -prune \\) ` +
    `-o -name .git -prune -print 2>/dev/null | head -120 | while read -r g; do ` +
    `r="\${g%/.git}"; printf '%s|%s\\n' "$r" "$(git -C "$r" log -1 --format=%aI 2>/dev/null | cut -c1-10)"; done`;
  const res = await sshRunAsync(host, script, 45_000);
  if (!res.ok) return [];

  const home = await remoteHome(host);
  const cutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const out: RemoteRepoCandidate[] = [];
  for (const line of res.stdout.split("\n")) {
    const [p, date] = line.split("|");
    if (!p || !date || date < cutoff) continue;
    const display = home && p.startsWith(home + "/") ? "~" + p.slice(home.length) : p;
    out.push({ entry: `${host}:${p}`, display, lastCommit: date });
  }
  return out.sort((a, b) => b.lastCommit.localeCompare(a.lastCommit)).slice(0, 15);
}

const WALK_SKIP = new Set([
  "node_modules",
  "Library",
  "Applications",
  "Movies",
  "Music",
  "Pictures",
  "Public",
  "go",
  "venv",
  ".Trash",
]);
const WALK_MAX_DEPTH = 4; // ~/a/b/c/d 까지 — 홈 바로 아래(~/proj)도 잡는다
const WALK_MAX_DIRS = 6000;

/** 홈에서 깊이 4까지 걸으며 git 저장소 발굴 (숨김·무거운 폴더 건너뜀, 저장소 안으로는 안 내려감) */
function walkForRepos(home: string): Set<string> {
  const found = new Set<string>();
  let visited = 0;
  const queue: { dir: string; depth: number }[] = [{ dir: home, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (visited++ > WALK_MAX_DIRS) break;
    for (const name of safeReaddir(dir)) {
      if (name.startsWith(".") || WALK_SKIP.has(name)) continue;
      const abs = path.join(dir, name);
      let st;
      try {
        st = fs.lstatSync(abs);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue; // 심링크는 따라가지 않음
      if (fs.existsSync(path.join(abs, ".git"))) {
        found.add(abs); // 저장소 발견 — 내부로는 내려가지 않는다
        continue;
      }
      if (depth + 1 <= WALK_MAX_DEPTH) queue.push({ dir: abs, depth: depth + 1 });
    }
  }
  return found;
}

/** 홈 전체(깊이 4)에서 최근 활동한 git 저장소 발굴 */
/** 이름에 키워드가 들어간 폴더 검색 — 홈 기준 깊이 {WALK_MAX_DEPTH}, 숨김·무거운 폴더 제외 */
export function searchDirsByName(keyword: string, max = 20): string[] {
  const q = keyword.toLowerCase();
  if (!q) return [];
  const hits: string[] = [];
  const queue: { dir: string; depth: number }[] = [{ dir: os.homedir(), depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && hits.length < max && visited < WALK_MAX_DIRS) {
    const item = queue.shift();
    if (!item) break;
    visited += 1;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(item.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".") || WALK_SKIP.has(e.name)) continue;
      const abs = path.join(item.dir, e.name);
      if (e.name.toLowerCase().includes(q)) {
        hits.push(abs);
        if (hits.length >= max) break;
      }
      if (item.depth + 1 < WALK_MAX_DEPTH) queue.push({ dir: abs, depth: item.depth + 1 });
    }
  }
  return hits;
}

export function discoverRepos(): RepoCandidate[] {
  const home = os.homedir();
  const out: RepoCandidate[] = [];
  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;

  const candidates = walkForRepos(home);
  const cwdRepo = findRepoRoot(process.cwd());
  if (cwdRepo) candidates.add(cwdRepo);

  for (const repo of candidates) {
    const res = spawnSync("git", ["log", "-1", "--format=%aI"], {
      cwd: repo,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (res.status !== 0) continue;
    const iso = res.stdout.trim();
    const ts = Date.parse(iso);
    if (Number.isNaN(ts) || ts < cutoff) continue;
    out.push({ path: repo, lastCommit: iso.slice(0, 10) });
  }
  return out.sort((a, b) => b.lastCommit.localeCompare(a.lastCommit)).slice(0, 15);
}

function findRepoRoot(start: string): string | null {
  let cur = start;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(cur, ".git"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
  return null;
}

function gitConfig(key: string): string | null {
  const res = spawnSync("git", ["config", "--global", key], { encoding: "utf8", timeout: 10_000 });
  if (res.status !== 0) return null;
  const v = res.stdout.trim();
  return v || null;
}

function safeReaddir(p: string): string[] {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function ago(ms: number): string {
  if (!ms) return "-";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days === 0) return t("오늘");
  if (days === 1) return t("어제");
  return t("{n}일 전", { n: days });
}
