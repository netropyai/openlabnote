import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { claudeProjectsDir } from "../lib/paths.js";
import { t } from "../lib/i18n.js";
import { fromYmd, addDays, isoToLocalYmd } from "../lib/dates.js";
import type { CollectRange, CollectorResult, RawEvent } from "./types.js";

/** 실제 사용자가 입력한 프롬프트가 아닌 래퍼/시스템 텍스트 판별 */
function isNoisePrompt(text: string): boolean {
  const t = text.trimStart();
  return (
    t.length === 0 ||
    t.startsWith("<command-name>") ||
    t.startsWith("<local-command-stdout>") ||
    t.startsWith("<local-command-caveat>") ||
    t.startsWith("<command-message>") ||
    t.startsWith("Caveat:") ||
    t.startsWith("[Request interrupted") ||
    t.startsWith("<system-reminder>")
  );
}

interface ClaudeRecord {
  type?: string;
  timestamp?: string;
  cwd?: string;
  isSidechain?: boolean;
  sessionId?: string;
  message?: { role?: string; content?: unknown };
  promptSource?: string;
}

/**
 * ~/.claude/projects/<slug>/<session>.jsonl 에서 기간 내 이벤트 수집.
 * - 프롬프트: type=user ∧ content가 문자열 ∧ 사이드체인 아님 (배열 content는 전부 tool_result)
 * - 응답: type=assistant 의 text 블록 — 세션×날짜당 마지막 것만 유지(결론 요약 목적)
 * - opts.rootDir: 다른 위치(원격에서 가져온 임시 디렉토리 등)를 읽을 때 지정
 * - opts.host: 원격 수집 시 이벤트에 호스트 태깅
 */
export async function collectClaudeCode(
  range: CollectRange,
  opts: { rootDir?: string; host?: string } = {},
): Promise<CollectorResult> {
  const root = opts.rootDir ?? claudeProjectsDir();
  const warnings: string[] = [];
  if (!fs.existsSync(root)) return { events: [], warnings };

  const sinceMs = fromYmd(range.since).getTime();
  const untilMs = fromYmd(addDays(range.until, 1)).getTime();

  const files: string[] = [];
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
      // 마지막 기록(mtime)이 기간 시작 전이면 기간 내 레코드가 없다
      if (stat.mtimeMs < sinceMs) continue;
      files.push(fp);
    }
  }

  const events: RawEvent[] = [];
  // 세션×날짜별 마지막 assistant text 응답만 유지
  const lastResponse = new Map<string, RawEvent>();
  // 세션 로그에 같은 프롬프트가 반복 기록되는 경우가 있어 세션 단위로 중복 제거
  const seenPrompts = new Set<string>();

  for (const fp of files) {
    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(fp, "utf8"),
        crlfDelay: Infinity,
      });
      let firstTsChecked = false;
      for await (const line of rl) {
        if (!line.trim()) continue;
        let rec: ClaudeRecord;
        try {
          rec = JSON.parse(line) as ClaudeRecord;
        } catch {
          continue; // 손상 라인은 건너뜀
        }
        if (!rec.timestamp) continue;
        const t = Date.parse(rec.timestamp);
        if (Number.isNaN(t)) continue;
        if (!firstTsChecked) {
          firstTsChecked = true;
          if (t >= untilMs) break; // 세션 시작이 기간 뒤 → 파일 전체 스킵
        }
        if (t < sinceMs || t >= untilMs) continue;
        if (rec.isSidechain) continue; // 서브에이전트 대화 제외
        const date = isoToLocalYmd(rec.timestamp);
        if (!date) continue;
        const cwd = rec.cwd ?? "";
        const ref = rec.sessionId ?? path.basename(fp, ".jsonl");

        if (rec.type === "user" && typeof rec.message?.content === "string") {
          const text = rec.message.content;
          if (isNoisePrompt(text)) continue;
          const dedupeKey = `${ref}|${normalizeForDedupe(text)}`;
          if (seenPrompts.has(dedupeKey)) continue;
          seenPrompts.add(dedupeKey);
          events.push({
            ts: rec.timestamp,
            date,
            source: "claude-code",
            kind: "prompt",
            cwd,
            ...(opts.host !== undefined ? { host: opts.host } : {}),
            text,
            ref,
          });
        } else if (rec.type === "assistant" && Array.isArray(rec.message?.content)) {
          const texts = (rec.message.content as Array<{ type?: string; text?: string }>)
            .filter((b) => b.type === "text" && typeof b.text === "string")
            .map((b) => b.text as string);
          if (texts.length === 0) continue;
          const ev: RawEvent = {
            ts: rec.timestamp,
            date,
            source: "claude-code",
            kind: "response",
            cwd,
            ...(opts.host !== undefined ? { host: opts.host } : {}),
            text: texts.join("\n"),
            ref,
          };
          lastResponse.set(`${ref}|${date}`, ev);
        }
      }
      rl.close();
    } catch (e) {
      warnings.push(t("claude-code 세션 파싱 실패: {file} ({err})", { file: path.basename(fp), err: (e as Error).message }));
    }
  }

  events.push(...lastResponse.values());
  return { events, warnings };
}

/** 공백·개행 차이만 다른 중복 프롬프트를 잡기 위한 정규화 */
function normalizeForDedupe(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}
