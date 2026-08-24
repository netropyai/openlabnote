import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { loadConfig } from "../lib/config.js";
import { addDays, todayYmd } from "../lib/dates.js";
import { renderHeatmap } from "../lib/heatmap.js";
import { expandTilde, contractTilde } from "../lib/paths.js";
import { computeStates, unwrittenOf } from "../lib/state.js";
import { t } from "../lib/i18n.js";
import { heading, info, nextLine } from "../lib/ui.js";

const WINDOW_WEEKS = 4;

export async function statusCommand(opts: { json?: boolean }): Promise<void> {
  const cfg = loadConfig();
  const until = todayYmd();
  const since = addDays(until, -(WINDOW_WEEKS * 7 - 1));
  const states = await computeStates(cfg, since, until);
  const unwritten = unwrittenOf(states);

  if (opts.json) {
    const perProject: Record<string, Record<string, unknown>> = {};
    for (const [pid, dates] of states) perProject[pid] = Object.fromEntries(dates);
    console.log(JSON.stringify({ since, until, states: perProject, unwritten }, null, 2));
    return;
  }

  console.log(heading(`${t("현황")}  ${pc.dim(t("최근 {n}주 · 노트 저장소 {dir}", { n: WINDOW_WEEKS, dir: contractTilde(expandTilde(cfg.notesDir)) }))}`));
  console.log("");
  console.log(renderHeatmap(states, WINDOW_WEEKS));
  console.log("");

  for (const project of cfg.projects) {
    const dir = path.join(expandTilde(cfg.notesDir), project.id);
    let total = 0;
    let last = "-";
    if (fs.existsSync(dir)) {
      const notes = fs
        .readdirSync(dir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .sort();
      total = notes.length;
      last = notes.at(-1)?.replace(".md", "") ?? "-";
    }
    const pending = unwritten.filter((u) => u.projectId === project.id).length;
    const drafts = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".draft.md")).length : 0;
    info(
      `${pc.bold(project.id.padEnd(20))} ` +
        t("노트 {n}건 · 마지막 {last}", { n: String(total).padStart(3), last }) +
        (pending ? pc.yellow(t("  미작성 {n}일", { n: pending })) : "") +
        (drafts ? pc.red(t("  초안 {n}건", { n: drafts })) : ""),
    );
  }

  const suggestions: string[] = [];
  if (unwritten.some((u) => u.date === until)) suggestions.push("oln today");
  if (unwritten.length > 0) suggestions.push(t("oln catchup  — 미작성 {n}건 정리", { n: unwritten.length }));
  if (suggestions.length === 0) suggestions.push("oln today");
  nextLine(...suggestions);
}
