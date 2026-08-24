import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectClaudeCode } from "./collectors/claude-code.js";
import { collectCodex } from "./collectors/codex.js";
import { collectGit } from "./collectors/git.js";
import { collectMedia, type MediaGroup } from "./collectors/media.js";
import type { CollectRange, RawEvent } from "./collectors/types.js";
import { readCaptures } from "./lib/captures.js";
import { projectForPath, type Config } from "./lib/config.js";
import { enumerateDays, isoToLocalHm, type Ymd } from "./lib/dates.js";
import { contractTilde, rawDir } from "./lib/paths.js";
import { t } from "./lib/i18n.js";
import { fetchRemoteJsonl, isHostDown, remoteHome } from "./lib/remote.js";
import { preflightRemotes } from "./lib/ssh-repair.js";

const PROMPT_MAX = 2000;
const RESPONSE_MAX = 600;

export interface DayStat {
  prompts: number;
  responses: number;
  commits: number;
  bytes: number;
}

export interface CollectSummary {
  range: CollectRange;
  /** projectId → date → 통계 */
  perProject: Map<string, Map<Ymd, DayStat>>;
  /** 어느 과제에도 매핑되지 않은 cwd → 이벤트 수 */
  unmapped: Map<string, number>;
  warnings: string[];
}

export async function runCollect(
  cfg: Config,
  range: CollectRange,
  onProgress?: (label: string) => void,
  opts?: { sshRepair?: boolean; preflighted?: boolean },
): Promise<CollectSummary> {
  const warnings: string[] = [];
  const events: RawEvent[] = [];

  // 원격 연결 점검 — 끊긴 호스트는 (대화형이면) 그 자리에서 재로그인 제안.
  // 스피너를 쓰는 호출자는 프롬프트가 스피너와 겹치지 않게 스피너 시작 전에 직접 돌리고 preflighted를 넘긴다.
  if (!opts?.preflighted) await preflightRemotes(cfg, warnings, { repair: opts?.sshRepair ?? false });

  if (cfg.sources.claudeCode) {
    onProgress?.("Claude Code");
    const r = await collectClaudeCode(range);
    events.push(...r.events);
    warnings.push(...r.warnings);
  }
  if (cfg.sources.codex) {
    onProgress?.("Codex");
    const r = await collectCodex(range);
    events.push(...r.events);
    warnings.push(...r.warnings);
  }
  onProgress?.("media");
  const media = collectMedia(cfg, range);

  if (cfg.sources.git) {
    onProgress?.("git");
    const r = await collectGit(cfg, range); // 원격 리포 항목 포함
    events.push(...r.events);
    warnings.push(...r.warnings);
  }

  // 원격 하네스 세션: 기간 내 수정된 jsonl만 ssh+tar로 당겨와 로컬 파서로 처리
  const remoteHomes = new Map<string, string>();
  for (const remote of cfg.remotes) {
    if (isHostDown(remote.host)) continue; // 프리플라이트에서 이미 끊김 확인 — 추가 타임아웃 방지
    onProgress?.(t("원격 {host}", { host: remote.host }));
    const home = await remoteHome(remote.host);
    if (home) remoteHomes.set(remote.host, home);

    if (cfg.sources.claudeCode && remote.claudeCode) {
      const dir = await fetchRemoteJsonl(remote.host, "~/.claude/projects", range.since, warnings);
      if (dir) {
        const r = await collectClaudeCode(range, { rootDir: dir, host: remote.host });
        events.push(...r.events);
        warnings.push(...r.warnings.map((w) => `${remote.host}: ${w}`));
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    if (cfg.sources.codex && remote.codex) {
      const dir = await fetchRemoteJsonl(remote.host, "~/.codex/sessions", range.since, warnings);
      if (dir) {
        const r = await collectCodex(range, { rootDir: dir, host: remote.host });
        events.push(...r.events);
        warnings.push(...r.warnings.map((w) => `${remote.host}: ${w}`));
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }

  // 과제 매핑
  const byProjectDate = new Map<string, Map<Ymd, RawEvent[]>>();
  const unmapped = new Map<string, number>();
  // 홈(~)에서 실행된 세션: 위치 정보가 없으므로 그날 활동한 과제의 raw에
  // "귀속 미정" 섹션으로 넣고, 관련 내용 선별은 작성 엔진에 맡긴다 (WRITE 지침).
  const homeByDate = new Map<Ymd, RawEvent[]>();
  const localHome = os.homedir();
  const isHomeCwd = (ev: RawEvent): boolean => {
    if (!ev.cwd || ev.kind === "commit") return false;
    const cwd = ev.cwd.replace(/\/+$/, "");
    if (ev.host) return remoteHomes.get(ev.host) === cwd;
    return cwd === localHome;
  };
  for (const ev of events) {
    const project = ev.cwd ? projectForPath(cfg, ev.cwd, ev.host, remoteHomes) : null;
    if (!project) {
      if (isHomeCwd(ev)) {
        const list = homeByDate.get(ev.date) ?? [];
        list.push(ev);
        homeByDate.set(ev.date, list);
        continue;
      }
      const key = ev.cwd ? (ev.host ? `${ev.host}:${ev.cwd}` : contractTilde(ev.cwd)) : "(cwd 없음)";
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
      continue;
    }
    let dates = byProjectDate.get(project.id);
    if (!dates) byProjectDate.set(project.id, (dates = new Map()));
    let list = dates.get(ev.date);
    if (!list) dates.set(ev.date, (list = []));
    list.push(ev);
  }

  // raw 파일 쓰기 (기간 내 멱등: 이벤트 없는 날짜의 기존 raw는 제거)
  const perProject = new Map<string, Map<Ymd, DayStat>>();
  const days = enumerateDays(range.since, range.until);
  for (const project of cfg.projects) {
    const dates = byProjectDate.get(project.id) ?? new Map<Ymd, RawEvent[]>();
    const stats = new Map<Ymd, DayStat>();
    const dir = rawDir(project.id);
    fs.mkdirSync(dir, { recursive: true });

    for (const day of days) {
      const fp = path.join(dir, `${day}.md`);
      const list = dates.get(day) ?? [];
      const captures = readCaptures(project.id, day); // 직접 기록이 있으면 이벤트가 없어도 raw를 만든다
      if (list.length === 0 && !captures) {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        continue;
      }
      const md = renderRawMd(project.id, day, list, media.get(project.id)?.get(day) ?? [], homeByDate.get(day) ?? [], captures);
      fs.writeFileSync(fp, md, "utf8");
      stats.set(day, {
        prompts: list.filter((e) => e.kind === "prompt").length,
        responses: list.filter((e) => e.kind === "response").length,
        commits: list.filter((e) => e.kind === "commit").length,
        bytes: Buffer.byteLength(md, "utf8"),
      });
    }
    updateIndex(dir, days, stats);
    if (stats.size > 0) perProject.set(project.id, stats);
  }

  return { range, perProject, unmapped, warnings };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + ` …(${text.length - max}자 생략)`;
}

function renderSessionBlocks(events: RawEvent[], lines: string[]): number {
  const sessions = new Map<string, RawEvent[]>();
  for (const e of events) {
    if (e.kind === "commit") continue;
    const key = `${e.source}|${e.ref}`;
    const list = sessions.get(key);
    if (list) list.push(e);
    else sessions.set(key, [e]);
  }
  const ordered = [...sessions.values()].sort((a, b) => (a[0]?.ts ?? "").localeCompare(b[0]?.ts ?? ""));
  for (const list of ordered) {
    list.sort((a, b) => a.ts.localeCompare(b.ts));
    const first = list[0];
    if (!first) continue;
    const last = list[list.length - 1];
    const prompts = list.filter((e) => e.kind === "prompt");
    const responses = list.filter((e) => e.kind === "response");
    const where = first.host ? `${first.host}:${first.cwd}` : contractTilde(first.cwd);
    lines.push(`### ${first.source} · ${isoToLocalHm(first.ts)}~${isoToLocalHm(last?.ts ?? first.ts)} · ${where}`);
    if (prompts.length > 0) {
      lines.push("");
      for (const p of prompts) {
        for (const l of truncate(p.text.trim(), PROMPT_MAX).split("\n")) lines.push(`> ${l}`);
        lines.push(">");
      }
      if (lines[lines.length - 1] === ">") lines.pop();
    }
    const lastResp = responses[responses.length - 1];
    if (lastResp) {
      lines.push("");
      lines.push(`**마지막 응답 발췌:** ${truncate(lastResp.text.replace(/\s+/g, " ").trim(), RESPONSE_MAX)}`);
    }
    lines.push("");
  }
  return ordered.length;
}

function renderRawMd(
  projectId: string,
  day: Ymd,
  events: RawEvent[],
  media: MediaGroup[],
  homeEvents: RawEvent[] = [],
  captures: string | null = null,
): string {
  const lines: string[] = [];
  lines.push(`# raw · ${projectId} · ${day}`);
  lines.push(`<!-- openlabnote raw dump — 로컬 전용, 업로드 금지 -->`);
  lines.push("");

  if (captures) {
    lines.push(`## captures (직접 기록 — 반드시 반영)`);
    lines.push(`<!-- 사용자가 그 순간 "기록하라"고 지시한 내용 — 노트에 빠짐없이, 최우선으로 반영할 것 -->`);
    lines.push("");
    lines.push(captures);
    lines.push("");
  }

  const commits = events.filter((e) => e.kind === "commit").sort((a, b) => a.ts.localeCompare(b.ts));
  if (commits.length > 0) {
    lines.push(`## commits (${commits.length})`);
    for (const c of commits) {
      const m = c.meta ?? {};
      lines.push(
        `- ${isoToLocalHm(c.ts)} \`${c.ref}\` [${m.repo ?? ""}] ${c.text} (+${m.added ?? 0}/−${m.deleted ?? 0}, ${m.files ?? 0} files)`,
      );
    }
    lines.push("");
  }

  // 세션 그룹핑: (source, ref)
  const probe: string[] = [];
  const sessionCount = renderSessionBlocks(events, probe);
  if (sessionCount > 0) {
    lines.push(`## sessions (${sessionCount})`);
    lines.push("");
    lines.push(...probe);
  }

  if (homeEvents.length > 0) {
    lines.push(`## home-sessions (귀속 미정 — 홈(~)에서 실행된 세션)`);
    lines.push(
      `<!-- 위치 정보가 없어 어느 과제인지 불명확. 이 과제(${projectId})와 명백히 관련된 내용만 노트에 반영하고, 무관하면 완전히 무시할 것 -->`,
    );
    lines.push("");
    renderSessionBlocks(homeEvents, lines);
  }
  if (media.length > 0) {
    lines.push(`## media (그림 후보 — 실존 파일, 이 목록의 경로만 FIG로 사용)`);
    for (const g of media) {
      if (g.files.length > 0) for (const f of g.files) lines.push(`- ${f}`);
      else lines.push(`- ${g.rep}  (같은 폴더에서 그날 ${g.count}개 — 대표 1개만 표시)`);
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/** raw/<project>/index.json — 날짜별 통계 (기간 내만 갱신, 밖은 보존) */
function updateIndex(dir: string, daysInRange: Ymd[], stats: Map<Ymd, DayStat>): void {
  const fp = path.join(dir, "index.json");
  let index: Record<string, DayStat> = {};
  if (fs.existsSync(fp)) {
    try {
      index = JSON.parse(fs.readFileSync(fp, "utf8")) as Record<string, DayStat>;
    } catch {
      index = {};
    }
  }
  for (const day of daysInRange) delete index[day];
  for (const [day, s] of stats) index[day] = s;
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(fp, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

/** raw index 읽기 (없으면 빈 객체) */
export function readRawIndex(projectId: string): Record<string, DayStat> {
  const fp = path.join(rawDir(projectId), "index.json");
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8")) as Record<string, DayStat>;
  } catch {
    return {};
  }
}

export function rawPath(projectId: string, day: Ymd): string {
  return path.join(rawDir(projectId), `${day}.md`);
}
