import * as clack from "@clack/prompts";
import fs from "node:fs";
import { runCollect, rawPath } from "../collect.js";
import { ENGINE_LABEL } from "../compose/engine.js";
import { composeAndSave } from "../compose/run.js";
import { loadConfig, notePath } from "../lib/config.js";
import { addDays, isYmd, todayYmd } from "../lib/dates.js";
import { t } from "../lib/i18n.js";
import { preflightRemotes } from "../lib/ssh-repair.js";
import { TaskList } from "../lib/tasklist.js";
import { die, dim, info, isInteractive, nextLine, ok, fail, step, symbols } from "../lib/ui.js";
import { reportUnmapped } from "./collect.js";

export interface CatchupOptions {
  since?: string;
  until?: string;
  yes?: boolean;
}

const DEFAULT_LOOKBACK_DAYS = 14;
const SECONDS_PER_NOTE = 35;

export async function catchupCommand(opts: CatchupOptions): Promise<void> {
  const cfg = loadConfig();
  const until = opts.until ?? todayYmd();
  const since = opts.since ?? addDays(until, -(DEFAULT_LOOKBACK_DAYS - 1));
  if (!isYmd(since) || !isYmd(until) || since > until)
    die(t("날짜 범위가 잘못됐습니다"), "oln catchup --since 2026-08-01 --until 2026-08-21");

  info(
    opts.since || opts.until
      ? t("대상 기간: {since} ~ {until}", { since, until })
      : t("대상 기간: {since} ~ {until} (기본 최근 {n}일 — 변경: --since/--until)", { since, until, n: DEFAULT_LOOKBACK_DAYS }),
  );
  const remoteWarnings: string[] = [];
  if (cfg.remotes.length > 0) await preflightRemotes(cfg, remoteWarnings, { repair: true });
  for (const w of remoteWarnings) clack.log.warn(w);
  const cspin = clack.spinner();
  cspin.start(t("① 수집 중…"));
  const summary = await runCollect(cfg, { since, until }, (label) =>
    cspin.message(t("① 수집 중… {s}", { s: label })),
    { preflighted: true },
  );
  cspin.stop(`① ${t("수집")}  ${dim(`${since} ~ ${until}`)}`);
  reportUnmapped(summary.unmapped);
  for (const w of summary.warnings) info(`${symbols.warn} ${w}`);

  // 미작성 대상: raw는 있고 노트는 없는 (과제, 날짜)
  const targets: { projectId: string; date: string }[] = [];
  for (const project of cfg.projects) {
    const dates = summary.perProject.get(project.id);
    if (!dates) continue;
    for (const date of [...dates.keys()].sort()) {
      if (!fs.existsSync(notePath(cfg, project.id, date)) && fs.existsSync(rawPath(project.id, date))) {
        targets.push({ projectId: project.id, date });
      }
    }
  }

  if (targets.length === 0) {
    ok(t("밀린 노트가 없습니다 — 기록이 있는 날짜는 모두 작성되어 있습니다"));
    nextLine("oln status", "oln today");
    return;
  }

  const byProject = new Map<string, string[]>();
  for (const tg of targets) {
    const list = byProject.get(tg.projectId) ?? [];
    list.push(tg.date);
    byProject.set(tg.projectId, list);
  }
  step("②", t("미작성 스캔"), t("{n}건 — 기록(raw)은 있는데 노트가 없는 (과제×날짜)", { n: targets.length }));
  for (const [pid, dates] of byProject) {
    info(`${pid}: ${dates.map((d) => d.slice(5)).join(", ")}`);
  }

  if (cfg.engine === "none") {
    info(t("엔진이 설정되지 않아 수집까지만 했습니다. 작성은 Claude Code에서 /labnote 를 실행하세요."));
    nextLine("/labnote  (Claude Code)", "oln setup engine  — 터미널 엔진 켜기");
    return;
  }

  const estMin = Math.ceil((targets.length * SECONDS_PER_NOTE) / 60);
  if (!opts.yes) {
    if (!isInteractive()) die(t("{n}건 작성에는 확인이 필요합니다", { n: targets.length }), "oln catchup --yes");
    const engineLabel = t("엔진 {e}", { e: ENGINE_LABEL[cfg.engine] });
    const go = await clack.confirm({
      message: t("{n}건을 작성합니다 (예상 ~{min}분, {engine}). 진행할까요?", { n: targets.length, min: estMin, engine: engineLabel }),
    });
    if (clack.isCancel(go) || !go) {
      info(t("취소됨"));
      return;
    }
  }

  // ③ 작성 루프 — 라이브 태스크 리스트로 전체 진행을 한 화면에서 (실패는 건너뛰고 마지막에 보고)
  let written = 0;
  const drafts: string[] = [];
  const engineName = ENGINE_LABEL[cfg.engine];
  const labels = targets.map((tg) => `${tg.date} · ${tg.projectId}`);
  const live = TaskList.supported;
  const list = new TaskList(labels, (done, total, elapsed) =>
    t("진행 {done}/{total} · 경과 {elapsed} · 엔진 {engine}", { done, total, elapsed, engine: engineName }),
  );
  if (live) list.start();

  for (let i = 0; i < targets.length; i++) {
    const tg = targets[i]!;
    const project = cfg.projects.find((p) => p.id === tg.projectId);
    if (!project) continue;
    if (live) list.run(i);
    else info(`[${i + 1}/${targets.length}] ${labels[i]} ${t("작성 중")}`);
    const outcome = await composeAndSave(cfg, project, tg.date, {});
    switch (outcome.status) {
      case "written":
        written += 1;
        if (live) list.done(i, "ok");
        else ok(`${labels[i]} ✓`);
        break;
      case "draft":
        drafts.push(`${tg.date}·${tg.projectId}`);
        if (live) list.done(i, "warn", t("검사 실패 → 초안 저장"));
        else info(`${labels[i]} ${t("검사 실패 → 초안 저장")}`);
        break;
      case "engine-error":
        if (live) {
          list.done(i, "err", t("엔진 오류"));
          list.stop();
        }
        // 엔진 자체 문제(미설치·로그인)면 나머지도 실패할 것 — 중단
        die(outcome.error?.message ?? t("엔진 오류"), outcome.error?.fix);
        break;
      default:
        if (live) list.done(i, "warn", t("건너뜀"));
        else info(`${labels[i]} ${t("건너뜀")}`);
    }
  }
  if (live) list.stop();

  console.log("");
  ok(t("완료: {n}건 작성{draft}", { n: written, draft: drafts.length ? t(" · 초안 {n}건", { n: drafts.length }) : "" }));
  if (drafts.length > 0) {
    fail(t("검사 실패 초안: {list} — 노트 폴더에서 .draft.md 확인", { list: drafts.join(", ") }));
  }
  nextLine("oln status", t("oln open  — 노트 폴더 열기"));
}
