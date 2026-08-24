import fs from "node:fs";
import pc from "picocolors";
import { runCollect } from "../collect.js";
import { composeAndSave } from "../compose/run.js";
import { loadConfig, notePath, type Config } from "../lib/config.js";
import { openFileForEdit } from "../lib/editor.js";
import { isYmd, todayYmd, type Ymd } from "../lib/dates.js";
import { contractTilde } from "../lib/paths.js";
import { t } from "../lib/i18n.js";
import { die, info, nextLine, ok, fail, renderMarkdown } from "../lib/ui.js";

export interface NoteOptions {
  project?: string;
  edit?: boolean;
  regen?: boolean;
}

export async function noteCommand(dateArg: string, opts: NoteOptions): Promise<void> {
  const cfg = loadConfig();
  const date: Ymd = dateArg === "today" ? todayYmd() : dateArg;
  if (!isYmd(date)) die(t("날짜 형식이 잘못됐습니다"), t("oln note 2026-08-21  또는  oln note today"));

  const projects = opts.project
    ? cfg.projects.filter((p) => p.id === opts.project)
    : cfg.projects;
  if (projects.length === 0) die(t("과제를 찾을 수 없습니다: {p}", { p: opts.project ?? "" }), t("oln setup projects  에서 과제 id 확인"));

  if (opts.regen) {
    await regen(cfg, projects, date);
    return;
  }

  let found = 0;
  for (const project of projects) {
    const fp = notePath(cfg, project.id, date);
    const draft = fp.replace(/\.md$/, ".draft.md");
    const target = fs.existsSync(fp) ? fp : fs.existsSync(draft) ? draft : null;
    if (!target) continue;
    found += 1;
    if (opts.edit) {
      if (openFileForEdit(target)) ok(t("편집기로 열었습니다: {path}", { path: contractTilde(target) }));
      else fail(t("편집기를 열 수 없습니다 — 직접 여세요: {path}", { path: contractTilde(target) }));
      continue;
    }
    console.log(pc.dim(`─ ${contractTilde(target)} ${"─".repeat(16)}`));
    console.log(renderMarkdown(fs.readFileSync(target, "utf8")));
  }

  if (found === 0) {
    info(t("{date} 노트가 없습니다", { date }));
    nextLine(t("oln note {date} --regen  — 이 날짜 작성", { date }), "oln catchup");
    return;
  }
  if (!opts.edit) nextLine(t("oln note {date} --edit", { date }), t("oln note {date} --regen  — 다시 작성", { date }));
}

async function regen(cfg: Config, projects: Config["projects"], date: Ymd): Promise<void> {
  info(t("{date} 기록 수집 중…", { date }));
  const summary = await runCollect(cfg, { since: date, until: date }, undefined, { sshRepair: true });
  let any = false;
  for (const project of projects) {
    if (!summary.perProject.get(project.id)?.has(date)) continue;
    any = true;
    const outcome = await composeAndSave(cfg, project, date, { force: true });
    if (outcome.status === "written") ok(t("{p}: 작성 완료 {path}", { p: project.id, path: contractTilde(outcome.path ?? "") }));
    else if (outcome.status === "draft") {
      fail(t("{p}: 검사 실패 — 초안 저장 {path}", { p: project.id, path: contractTilde(outcome.path ?? "") }));
      for (const i of (outcome.issues ?? []).filter((x) => x.severity === "error")) info(`   [${i.code}] ${i.message}`);
    } else if (outcome.status === "engine-error") die(outcome.error?.message ?? t("엔진 오류"), outcome.error?.fix);
  }
  if (!any) info(t("{date}에 수집된 기록이 없습니다", { date }));
  nextLine(`oln note ${date}`, "oln status");
}

