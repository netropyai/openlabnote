import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expandTilde, contractTilde } from "../lib/paths.js";
import { expandRemoteTilde, isHostDown, remoteGitLog } from "../lib/remote.js";
import { t } from "../lib/i18n.js";
import { addDays, isoToLocalYmd } from "../lib/dates.js";
import { parseRepoEntry, type Config } from "../lib/config.js";
import type { CollectRange, CollectorResult, RawEvent } from "./types.js";

const COMMIT_SEP = "@@OLN@@";

interface ParsedCommit {
  hash: string;
  iso: string;
  author: string;
  subject: string;
  added: number;
  deleted: number;
  files: number;
}

function parseGitLog(stdout: string): ParsedCommit[] {
  const out: ParsedCommit[] = [];
  for (const chunk of stdout.split(COMMIT_SEP)) {
    if (!chunk.trim()) continue;
    const lines = chunk.split("\n");
    const head = lines[0] ?? "";
    const sep1 = head.indexOf("|");
    const sep2 = head.indexOf("|", sep1 + 1);
    const sep3 = head.indexOf("|", sep2 + 1);
    if (sep1 < 0 || sep2 < 0 || sep3 < 0) continue;
    let added = 0;
    let deleted = 0;
    let files = 0;
    for (const l of lines.slice(1)) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(l);
      if (!m) continue;
      files += 1;
      if (m[1] !== "-") added += Number(m[1]);
      if (m[2] !== "-") deleted += Number(m[2]);
    }
    out.push({
      hash: head.slice(0, sep1),
      iso: head.slice(sep1 + 1, sep2),
      author: head.slice(sep2 + 1, sep3),
      subject: head.slice(sep3 + 1),
      added,
      deleted,
      files,
    });
  }
  return out;
}

/**
 * config.projects[].repos 의 git 저장소에서 기간 내 본인 커밋 수집.
 * - author 필터: config.author.gitAuthors 부분 문자열 매칭(대소문자 무시, OR)
 * - 원격 항목("호스트:~/경로")은 ssh로 git log 실행 (lib/remote)
 * - --since는 rebase된 히스토리에서 순회를 조기 중단하므로 --since-as-filter 사용, 구버전 git은 폴백
 */
export async function collectGit(cfg: Config, range: CollectRange): Promise<CollectorResult> {
  const warnings: string[] = [];
  const events: RawEvent[] = [];
  const patterns = cfg.author.gitAuthors.map((a) => a.toLowerCase());
  const untilExclusive = addDays(range.until, 1);

  const entries = new Set<string>();
  for (const project of cfg.projects) for (const r of project.repos) entries.add(r);

  for (const entry of entries) {
    const parsed = parseRepoEntry(entry);
    let stdout: string | null = null;
    let cwd: string;
    let repoLabel: string;

    if (parsed.host === undefined) {
      const repo = expandTilde(parsed.path);
      cwd = repo;
      repoLabel = path.basename(repo);
      if (!fs.existsSync(path.join(repo, ".git"))) {
        warnings.push(t("git 저장소가 아님: {repo}", { repo: contractTilde(repo) }));
        continue;
      }
      const logArgs = (sinceFlag: string): string[] => [
        "log",
        "--no-merges",
        `${sinceFlag}=${range.since} 00:00:00`,
        `--until=${untilExclusive} 00:00:00`,
        `--pretty=format:${COMMIT_SEP}%h|%aI|%an|%s`,
        "--numstat",
      ];
      let res = spawnSync("git", logArgs("--since-as-filter"), {
        cwd: repo,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      if (res.status !== 0 && /since-as-filter/.test(res.stderr || "")) {
        res = spawnSync("git", logArgs("--since"), { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      }
      if (res.status !== 0) {
        warnings.push(t("git log 실패: {repo} ({err})", { repo: contractTilde(repo), err: (res.stderr || "").trim().slice(0, 120) }));
        continue;
      }
      stdout = res.stdout;
    } else {
      const host = parsed.host;
      if (isHostDown(host)) continue; // 프리플라이트에서 이미 안내됨
      const expanded = await expandRemoteTilde(host, parsed.path);
      if (!expanded) {
        warnings.push(t("{host}: 원격 $HOME 확인 실패 — ssh {host} 로 키 인증을 확인하세요", { host }));
        continue;
      }
      cwd = expanded;
      repoLabel = `${host}:${path.posix.basename(expanded)}`;
      let res = await remoteGitLog(host, parsed.path, {
        sinceFlag: "--since-as-filter",
        since: range.since,
        untilExclusive,
        sep: COMMIT_SEP,
      });
      if (!res.ok && /since-as-filter/.test(res.stderr)) {
        res = await remoteGitLog(host, parsed.path, {
          sinceFlag: "--since",
          since: range.since,
          untilExclusive,
          sep: COMMIT_SEP,
        });
      }
      if (!res.ok) {
        const reason = res.connectionFailed ? t("SSH 연결 실패 — 키 인증 확인") : res.stderr.trim().slice(0, 120);
        warnings.push(t("원격 git log 실패: {entry} ({reason})", { entry, reason }));
        continue;
      }
      stdout = res.stdout;
    }

    for (const c of parseGitLog(stdout)) {
      const authorLc = c.author.toLowerCase();
      if (!patterns.some((p) => authorLc.includes(p))) continue;
      const date = isoToLocalYmd(c.iso);
      if (!date || date < range.since || date > range.until) continue;
      events.push({
        ts: c.iso,
        date,
        source: "git",
        kind: "commit",
        cwd,
        ...(parsed.host !== undefined ? { host: parsed.host } : {}),
        text: c.subject,
        ref: c.hash,
        meta: { added: c.added, deleted: c.deleted, files: c.files, repo: repoLabel },
      });
    }
  }
  return { events, warnings };
}
