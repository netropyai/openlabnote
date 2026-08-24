import * as clack from "@clack/prompts";
import fs from "node:fs";
import pc from "picocolors";
import { runCollect } from "../collect.js";
import { ENGINE_LABEL } from "../compose/engine.js";
import { composeAndSave, type ComposeOutcome } from "../compose/run.js";
import { loadConfig, notePath, type Project } from "../lib/config.js";
import { isYmd, todayYmd } from "../lib/dates.js";
import { t } from "../lib/i18n.js";
import { contractTilde } from "../lib/paths.js";
import { die, dim, info, isInteractive, nextLine, ok, fail, renderMarkdown, step, symbols } from "../lib/ui.js";
import { launchUiBackground } from "../lib/ui-launch.js";
import { preflightRemotes } from "../lib/ssh-repair.js";
import { capturePath, countCaptures } from "../lib/captures.js";
import { reportUnmapped } from "./collect.js";

export interface TodayOptions {
  date?: string;
  force?: boolean;
}

export async function todayCommand(opts: TodayOptions): Promise<void> {
  const cfg = loadConfig();
  const date = opts.date ?? todayYmd();
  if (!isYmd(date)) die(t("날짜 형식이 잘못됐습니다 (YYYY-MM-DD)"), "oln today --date 2026-08-21");

  // ⓪ 기존 노트 확인 — 수집(비용이 드는 작업) 전에 먼저 보여주고 결정받는다
  const decisions = new Map<string, "force" | "fresh" | "skip">();
  for (const project of cfg.projects) {
    const target = notePath(cfg, project.id, date);
    if (!fs.existsSync(target)) {
      decisions.set(project.id, "fresh");
      continue;
    }
    if (opts.force) {
      decisions.set(project.id, "force");
      continue;
    }
    if (!isInteractive()) {
      decisions.set(project.id, "skip");
      continue;
    }
    console.log(pc.dim(`─ ${date} · ${project.title} ${"─".repeat(20)}`));
    console.log(renderMarkdown(fs.readFileSync(target, "utf8")));
    // 노트 작성 이후에 추가된 직접 기록이 있으면 다시 작성을 권한다
    const capFile = capturePath(project.id, date);
    if (fs.existsSync(capFile) && fs.statSync(capFile).mtimeMs > fs.statSync(target).mtimeMs) {
      clack.log.warn(
        t("이 노트 이후에 추가된 직접 기록이 있습니다 (oln capture {n}건) — \"새로 수집해서 다시 작성\"을 권장합니다", {
          n: countCaptures(project.id, date),
        }),
      );
    }
    const answer = await clack.select({
      message: t("{p}의 {date} 노트가 이미 있습니다 (위 내용).", { p: project.id, date }),
      options: [
        { value: "skip", label: t("그대로 두기") },
        { value: "edit", label: t("내가 직접 수정하기"), hint: t("웹 뷰어가 열립니다") },
        { value: "force", label: t("새로 수집해서 다시 작성"), hint: t("기존은 .bak 보관") },
      ],
    });
    const v = clack.isCancel(answer) ? "skip" : (answer as "skip" | "edit" | "force");
    if (v === "edit") {
      await launchUiBackground({ projectId: project.id, date });
      info(t("브라우저에서 수정 후 저장하면 바로 반영됩니다 (형식 검사 포함)"));
      decisions.set(project.id, "skip");
    } else {
      decisions.set(project.id, v);
    }
  }
  if ([...decisions.values()].every((d) => d === "skip")) {
    ok(t("오늘 노트는 그대로 둡니다 — 할 일이 없습니다"));
    return;
  }

  // ① 수집 — 원격 점검(재로그인 프롬프트 가능)은 스피너와 겹치지 않게 먼저
  const remoteWarnings: string[] = [];
  if (cfg.remotes.length > 0) await preflightRemotes(cfg, remoteWarnings, { repair: true });
  for (const w of remoteWarnings) clack.log.warn(w);
  const cspin = clack.spinner();
  cspin.start(t("① 수집 중…"));
  const summary = await runCollect(cfg, { since: date, until: date }, (label) =>
    cspin.message(t("① 수집 중… {s}", { s: label })),
    { preflighted: true },
  );
  cspin.stop(`① ${t("수집")}  ${dim(date)}`);
  const activeProjects = cfg.projects.filter((p) => summary.perProject.get(p.id)?.has(date));
  const statLine = (p: Project): string => {
    const s = summary.perProject.get(p.id)?.get(date);
    return s ? t("프롬프트 {p} · 응답 {r} · 커밋 {c}", { p: s.prompts, r: s.responses, c: s.commits }) : "";
  };
  for (const p of activeProjects) ok(`${p.id}  ${statLine(p)}`);
  reportUnmapped(summary.unmapped);
  for (const w of summary.warnings) info(`${symbols.warn} ${w}`);

  if (activeProjects.length === 0) {
    info(t("수집된 기록이 없습니다 (프롬프트 0 · 커밋 0)"));
    nextLine(t("oln catchup  — 지난 날짜 정리"), "oln status");
    return;
  }

  // 엔진이 없으면 수집까지만 — 작성은 하네스(/labnote)에서
  if (cfg.engine === "none") {
    info(t("엔진이 설정되지 않아 수집까지만 했습니다. 작성은 Claude Code에서 /labnote 를 실행하세요."));
    nextLine("/labnote  (Claude Code)", "oln setup engine  — 터미널 엔진 켜기");
    return;
  }

  // ② 작성 (과제별)
  const outcomes: ComposeOutcome[] = [];
  for (const project of activeProjects) {
    const force = decisions.get(project.id) ?? "fresh";
    if (force === "skip") {
      outcomes.push({ projectId: project.id, date, status: "skipped-exists", path: notePath(cfg, project.id, date) });
      continue;
    }
    const spin = clack.spinner();
    const engineLabel = t(" · 엔진 {e}", { e: ENGINE_LABEL[cfg.engine] });
    spin.start(`② ${t("작성")}  ${project.id}${engineLabel}`);
    const started = Date.now();
    const tick = setInterval(
      () => spin.message(`② ${t("작성")}  ${project.id}${engineLabel}  ${Math.round((Date.now() - started) / 1000)}s`),
      1000,
    );
    const outcome = await composeAndSave(cfg, project, date, { force: force === "force" });
    clearInterval(tick);
    if (outcome.status === "written") spin.stop(`② ${t("작성")}  ${project.id}  ${dim(`(${Math.round((outcome.elapsedMs ?? 0) / 1000)}s)`)}`);
    else spin.stop(`✗ ② ${t("작성")}  ${project.id}`);
    outcomes.push(outcome);
  }

  // ③ 결과 보고
  let anyWritten = false;
  for (const o of outcomes) {
    const project = cfg.projects.find((p) => p.id === o.projectId);
    switch (o.status) {
      case "written": {
        anyWritten = true;
        const s = o.issues ?? [];
        const warns = s.filter((i) => i.severity === "warn");
        step("③", t("검사"), t("{p} — 통과{warn}", { p: o.projectId, warn: warns.length ? t(" (경고 {n})", { n: warns.length }) : "" }));
        console.log("");
        console.log(pc.dim(`─ ${o.date} · ${project?.title ?? o.projectId} ${"─".repeat(20)}`));
        console.log(renderMarkdown(o.md ?? ""));
        ok(`${t("저장")}  ${contractTilde(o.path ?? "")}`);
        break;
      }
      case "draft":
        fail(t("{p}: 검사 실패 — 초안으로 저장 {path}", { p: o.projectId, path: contractTilde(o.path ?? "") }));
        for (const i of (o.issues ?? []).filter((i) => i.severity === "error"))
          info(`   [${i.code}] ${i.message}`);
        info(t("   직접 고치거나 Claude Code에서 /labnote 로 다시 작성하세요"));
        break;
      case "skipped-exists":
        info(t("{p}: 이미 작성된 노트 유지 {path}", { p: o.projectId, path: dim(contractTilde(o.path ?? "")) }));
        break;
      case "engine-error":
        die(o.error?.message ?? t("엔진 오류"), o.error?.fix);
        break;
      case "no-raw":
        break;
    }
  }

  if (anyWritten) nextLine(t("oln note today --edit  — 수정"), "oln status");
  else nextLine("oln status");
}

