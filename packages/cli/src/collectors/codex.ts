import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { codexSessionsDir } from "../lib/paths.js";
import { t } from "../lib/i18n.js";
import { isoToLocalYmd } from "../lib/dates.js";
import type { CollectRange, CollectorResult, RawEvent } from "./types.js";

interface CodexRecord {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    message?: string;
    cwd?: string;
  };
}

function isNoisePrompt(text: string): boolean {
  const t = text.trimStart();
  return (
    t.length === 0 ||
    t.startsWith("<environment_context>") ||
    t.startsWith("<user_shell_command>") ||
    t.startsWith("<turn_aborted>")
  );
}

/**
 * ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl 에서 기간 내 이벤트 수집.
 * 파일 경로의 날짜로 1차 필터, 레코드 timestamp(로컬 변환)로 확정.
 * cwd는 session_meta에서 시작해 turn_context가 나올 때마다 갱신.
 * opts.rootDir/host: 원격에서 가져온 임시 디렉토리 수집용.
 */
export async function collectCodex(
  range: CollectRange,
  opts: { rootDir?: string; host?: string } = {},
): Promise<CollectorResult> {
  const root = opts.rootDir ?? codexSessionsDir();
  const warnings: string[] = [];
  if (!fs.existsSync(root)) return { events: [], warnings };

  // 경로 날짜 기준 후보 파일 수집 (UTC 경계 오차를 위해 앞뒤 하루 여유)
  const files: string[] = [];
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
        const m = /(\d{4})\/(\d{2})\/(\d{2})\/[^/]+$/.exec(abs.split(path.sep).join("/"));
        if (m) {
          const pathDate = `${m[1]}-${m[2]}-${m[3]}`;
          // 파일 경로 날짜가 기간 ±1일 밖이면 스킵 — 단, 오래 열린 세션(경로는 시작일)은 mtime으로 구제
          if (pathDate < addDaysStr(range.since, -1) || pathDate > addDaysStr(range.until, 1)) {
            try {
              if (fs.statSync(abs).mtime.toISOString().slice(0, 10) < addDaysStr(range.since, -1)) continue;
            } catch {
              continue;
            }
          }
        }
        files.push(abs);
      }
    }
  };
  walk(root, 0);

  const events: RawEvent[] = [];
  const lastResponse = new Map<string, RawEvent>();
  const seenPrompts = new Set<string>();

  for (const fp of files) {
    const ref = path.basename(fp, ".jsonl");
    let cwd = "";
    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(fp, "utf8"),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line.trim()) continue;
        let rec: CodexRecord;
        try {
          rec = JSON.parse(line) as CodexRecord;
        } catch {
          continue;
        }
        const p = rec.payload;
        if (!p) continue;
        if (rec.type === "session_meta" && typeof p.cwd === "string") cwd = p.cwd;
        if (rec.type === "turn_context" && typeof p.cwd === "string") cwd = p.cwd;
        if (!rec.timestamp) continue;
        const date = isoToLocalYmd(rec.timestamp);
        if (!date || date < range.since || date > range.until) continue;

        if (rec.type === "event_msg" && p.type === "user_message" && typeof p.message === "string") {
          if (isNoisePrompt(p.message)) continue;
          const dedupeKey = `${ref}|${p.message.replace(/\s+/g, " ").trim().slice(0, 500)}`;
          if (seenPrompts.has(dedupeKey)) continue;
          seenPrompts.add(dedupeKey);
          events.push({
            ts: rec.timestamp,
            date,
            source: "codex",
            kind: "prompt",
            cwd,
            ...(opts.host !== undefined ? { host: opts.host } : {}),
            text: p.message,
            ref,
          });
        } else if (rec.type === "event_msg" && p.type === "agent_message" && typeof p.message === "string") {
          lastResponse.set(`${ref}|${date}`, {
            ts: rec.timestamp,
            date,
            source: "codex",
            kind: "response",
            cwd,
            ...(opts.host !== undefined ? { host: opts.host } : {}),
            text: p.message,
            ref,
          });
        }
      }
      rl.close();
    } catch (e) {
      warnings.push(t("codex 세션 파싱 실패: {file} ({err})", { file: path.basename(fp), err: (e as Error).message }));
    }
  }

  events.push(...lastResponse.values());
  return { events, warnings };
}

function addDaysStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y as number, (m as number) - 1, (d as number) + n);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
