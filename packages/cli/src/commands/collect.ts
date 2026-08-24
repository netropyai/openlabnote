import * as clack from "@clack/prompts";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { runCollect } from "../collect.js";
import { loadConfig } from "../lib/config.js";
import { isYmd, todayYmd } from "../lib/dates.js";
import { t } from "../lib/i18n.js";
import { olnHome } from "../lib/paths.js";
import { preflightRemotes } from "../lib/ssh-repair.js";
import { die, info, nextLine, ok, symbols } from "../lib/ui.js";

export interface CollectOptions {
  since?: string;
  until?: string;
  json?: boolean;
}

export async function collectCommand(opts: CollectOptions): Promise<void> {
  const cfg = loadConfig();
  const until = opts.until ?? todayYmd();
  const since = opts.since ?? until;
  if (!isYmd(since) || !isYmd(until)) die(t("날짜 형식이 잘못됐습니다 (YYYY-MM-DD)"), "oln collect --since 2026-08-01 --until 2026-08-21");
  if (since > until) die(t("--since가 --until보다 뒤입니다"), t("범위를 확인하세요"));

  const interactive = !opts.json && process.stdout.isTTY;
  if (interactive && cfg.remotes.length > 0) {
    // 원격 점검(재로그인 프롬프트 가능)은 스피너 시작 전에
    const remoteWarnings: string[] = [];
    await preflightRemotes(cfg, remoteWarnings, { repair: true });
    for (const w of remoteWarnings) clack.log.warn(w);
  }
  const cspin = interactive ? clack.spinner() : null;
  cspin?.start(t("① 수집 중…"));
  const summary = await runCollect(cfg, { since, until }, (label) => cspin?.message(t("① 수집 중… {s}", { s: label })), { preflighted: interactive });
  cspin?.stop(`① ${t("수집")}  ${since === until ? since : `${since} ~ ${until}`}`);

  if (opts.json) {
    const perProject: Record<string, Record<string, unknown>> = {};
    for (const [pid, dates] of summary.perProject) perProject[pid] = Object.fromEntries(dates);
    console.log(
      JSON.stringify(
        {
          range: summary.range,
          perProject,
          unmapped: Object.fromEntries(summary.unmapped),
          warnings: summary.warnings,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (summary.perProject.size === 0) {
    info(t("수집된 기록이 없습니다"));
  }
  for (const [pid, dates] of summary.perProject) {
    let prompts = 0;
    let commits = 0;
    for (const s of dates.values()) {
      prompts += s.prompts;
      commits += s.commits;
    }
    ok(t("{pid}  {d}일 · 프롬프트 {p} · 커밋 {c}", { pid, d: dates.size, p: prompts, c: commits }));
  }
  reportUnmapped(summary.unmapped);
  for (const w of summary.warnings) info(`${symbols.warn} ${w}`);
  nextLine("oln today", "oln catchup");
}

/**
 * 미매핑 경로는 "처음 발견됐을 때 한 번만" 알린다.
 * 본 적 있는 경로는 ~/.openlabnote/unmapped-seen.json에 기억하고 조용히 무시.
 */
export function reportUnmapped(unmapped: Map<string, number>): void {
  if (unmapped.size === 0) return;
  const seenFile = path.join(olnHome(), "unmapped-seen.json");
  let seen: string[] = [];
  try {
    seen = JSON.parse(fs.readFileSync(seenFile, "utf8")) as string[];
  } catch {
    /* 첫 실행 */
  }
  const seenSet = new Set(seen);
  const fresh = [...unmapped.entries()].filter(([cwd]) => !seenSet.has(cwd));
  if (fresh.length === 0) return; // 전부 본 적 있는 경로 — 조용히

  // 전부 보여준다 (과다 방지 상한 40) — 상한에 걸려 못 보여준 경로는 seen에 넣지 않아 다음 실행에서 이어서 안내
  const sorted = fresh.sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, 40);
  info(`${symbols.warn} ` + t("새로 발견된 미매핑 경로 {n}곳 — 과제에 속하지 않아 노트에 반영되지 않습니다", { n: fresh.length }));
  for (const [cwd, n] of shown) info(`   ${cwd} (${n}${t("건")})`);
  if (sorted.length > shown.length) {
    info(pc.dim(`   … ${t("외 {n}곳 — 다음 실행에서 이어서 안내", { n: sorted.length - shown.length })}`));
  }
  info(t("   과제로 넣으려면:  oln setup projects  · 이 안내는 경로당 한 번만 표시됩니다"));
  if (shown.some(([cwd]) => cwd === "~")) {
    info(t("   '~'는 홈 폴더에서 시작한 세션입니다 — 과제 폴더 안에서 세션을 시작하면 자동 매핑됩니다"));
  }
  try {
    fs.writeFileSync(seenFile, JSON.stringify([...seenSet, ...shown.map(([cwd]) => cwd)], null, 2));
  } catch {
    /* 기억 실패는 치명적이지 않음 */
  }
}
