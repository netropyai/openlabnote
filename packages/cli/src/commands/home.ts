import * as clack from "@clack/prompts";
import pc from "picocolors";
import { configExists, loadConfig } from "../lib/config.js";
import { addDays, todayYmd } from "../lib/dates.js";
import { renderHeatmap } from "../lib/heatmap.js";
import { contractTilde, expandTilde } from "../lib/paths.js";
import { computeStates, unwrittenOf } from "../lib/state.js";
import { t } from "../lib/i18n.js";
import { heading, isInteractive, nextLine } from "../lib/ui.js";
import { launchUiBackground } from "../lib/ui-launch.js";
import { maybeCheckForUpdates, updateNoticeLine } from "../lib/update.js";
import { CLI_VERSION } from "../lib/version.js";
import { takeWhatsNew } from "../lib/whatsnew.js";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { catchupCommand } from "./catchup.js";
import { exportCommand } from "./export.js";
import { releaseStdin, runHomeApp, type HomeMenuItem } from "./home-ink.js";
import { initCommand } from "./init.js";
import { noteCommand } from "./note.js";
import { openCommand } from "./open.js";
import { setupCommand } from "./setup.js";
import { statusCommand } from "./status.js";
import { todayCommand } from "./today.js";

const HOME_WEEKS = 2;

export async function homeCommand(): Promise<void> {
  if (!configExists()) {
    await initCommand(); // 설정 완료 시 init이 직접 홈으로 진입한다
    return;
  }
  if (isInteractive()) console.clear(); // 이전 터미널 히스토리와 분리된 깨끗한 홈

  // 업데이트 후 첫 홈 진입의 새 소식 — 세션 동안 유지, 다음 세션엔 표시 안 함
  const whatsNew = isInteractive() ? takeWhatsNew(CLI_VERSION) : null;

  // 상주 홈: Ink 대시보드 ↔ 액션(일반 터미널 출력) 왕복
  for (;;) {
    if (isInteractive()) console.clear(); // 액션 출력과 분리된 깨끗한 홈
    const cfg = loadConfig();
    const until = todayYmd();
    const since = addDays(until, -(HOME_WEEKS * 7 - 1));
    const states = await computeStates(cfg, since, until); // 히트맵·밀린 일수 계산용
    const unwrittenDays = new Set(unwrittenOf(states).map((u) => u.date)).size;
    const notesBase = expandTilde(cfg.notesDir);

    // 정확한 로컬 사실만 표시: 과제별 마지막 노트 날짜 (파일 기준)
    const lastNoteOf = (pid: string): string | null => {
      const dir = path.join(notesBase, pid);
      if (!fs.existsSync(dir)) return null;
      const dates = fs
        .readdirSync(dir)
        .map((f) => /^(\d{4}-\d{2}-\d{2})\.md$/.exec(f)?.[1])
        .filter((d): d is string => !!d)
        .sort();
      return dates[dates.length - 1] ?? null;
    };
    const dayGap = (d: string | null): number => {
      if (!d) return HOME_WEEKS * 7; // 노트가 아예 없으면 기본 기간만큼 밀린 것으로
      const ms = Date.parse(until) - Date.parse(d);
      return Math.max(0, Math.round(ms / 86_400_000));
    };
    const projects = cfg.projects.map((p) => {
      const last = lastNoteOf(p.id);
      const gap = dayGap(last);
      return {
        id: p.id,
        status:
          gap === 0 ? t("✓ 오늘 작성됨") : last ? t("마지막 노트 {d} ({n}일 전)", { d: last.slice(5), n: gap }) : t("노트 없음"),
        ok: gap === 0,
      };
    });
    const todayDone = cfg.projects.every((p) => lastNoteOf(p.id) === until);

    const context = t("과제 {n} · 노트 저장소 {dir}", { n: cfg.projects.length, dir: contractTilde(expandTilde(cfg.notesDir)) });
    const heatmap = renderHeatmap(states, HOME_WEEKS);
    maybeCheckForUpdates(cfg); // 주 1회 · 비차단 — 결과는 다음 렌더에 반영
    const updateNotice = updateNoticeLine(CLI_VERSION);

    if (!isInteractive()) {
      console.log(heading(`openlabnote  ${pc.dim(context)}`));
      console.log("");
      console.log(heatmap);
      if (updateNotice) console.log(pc.yellow(`▲ ${updateNotice}`));
      nextLine("oln today", unwrittenDays > 0 ? t("oln catchup  — 밀린 {n}일치", { n: unwrittenDays }) : "oln status");
      return;
    }

    const items: HomeMenuItem[] = [
      {
        key: "today",
        label: todayDone ? t("오늘 정리하기 (이미 작성됨 — 다시 작성 가능)") : t("오늘 정리하기"),
        hint: "oln today",
        section: t("노트 작성"),
      },
    ];
    if (unwrittenDays > 0)
      items.push({ key: "catchup", label: t("밀린 {n}일치 정리하기", { n: unwrittenDays }), hint: "oln catchup" });
    items.push(
      { key: "catchup-range", label: t("기간 지정해서 정리하기"), hint: "oln catchup --since" },
      { key: "ui", label: t("웹 뷰어로 보기"), hint: "oln ui", section: t("보기 · 내보내기") },
      { key: "note", label: t("특정 날짜 노트 보기"), hint: "oln note <date>" },
      { key: "status", label: t("현황 자세히"), hint: "oln status" },
      { key: "export", label: t("내보내기 (제출용 PNG·PDF)"), hint: "oln export" },
      { key: "open", label: t("노트 폴더 열기"), hint: "oln open" },
      { key: "setup", label: t("설정"), hint: "oln setup", section: t("관리") },
      { key: "quit", label: t("종료"), hint: "q / ESC" },
    );

    const pick = await runHomeApp({
      brand: "openlabnote",
      context,
      heatmapTitle: t("최근 {n}주", { n: HOME_WEEKS }),
      heatmap,
      projects,
      items,
      ...(updateNotice ? { updateNotice } : {}),
      ...(whatsNew ? { whatsNew } : {}),
    });
    if (!pick || pick === "quit") {
      releaseStdin();
      return;
    }

    // 액션 전용 화면: 상단 고정 헤더 아래에 실행 내용만 표시
    const label = items.find((it) => it.key === pick)?.label ?? pick;
    console.clear();
    console.log(`${pc.green(pc.bold("▚"))} ${pc.bold("openlabnote")}  ${pc.dim("·")}  ${label}`);
    console.log(pc.dim("─".repeat(60)));
    console.log("");
    await dispatch(pick, until);
    if (pick !== "ui") await waitForHome();
  }
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** 존재하는 노트를 최신순 리스트로 골라 보게 한다 (타이핑 = 검색) */
async function pickNoteDate(): Promise<{ date: string; projectId: string } | null> {
  const cfg = loadConfig();
  const base = expandTilde(cfg.notesDir);
  const entries: { date: string; projectId: string }[] = [];
  for (const p of cfg.projects) {
    const dir = path.join(base, p.id);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(f);
      if (m?.[1]) entries.push({ date: m[1], projectId: p.id });
    }
  }
  if (entries.length === 0) {
    nextLine("oln today", "oln catchup");
    return null;
  }
  entries.sort((a, b) => b.date.localeCompare(a.date) || a.projectId.localeCompare(b.projectId));
  const options = entries.slice(0, 60).map((e) => {
    const day = WEEKDAYS_KO[new Date(`${e.date}T00:00:00`).getDay()] ?? "";
    return {
      value: `${e.projectId}|${e.date}`,
      label: `${e.date} (${t(day)})`,
      hint: e.projectId,
    };
  });
  const pick = await clack.autocomplete({
    message: t("어느 노트를 볼까요? (글자 입력 = 검색)"),
    options,
  });
  if (clack.isCancel(pick)) return null;
  const [projectId, date] = String(pick).split("|");
  return projectId && date ? { date, projectId } : null;
}

/** 액션 결과를 지우지 않고 사용자가 확인한 뒤 홈으로 돌아간다 */
function waitForHome(): Promise<void> {
  return new Promise((resolve) => {
    console.log("");
    console.log(pc.dim("─".repeat(60)));
    if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
    process.stdin.resume();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(pc.dim(t("Enter를 누르면 홈으로 돌아갑니다 ")), () => {
      rl.close();
      resolve();
    });
    rl.on("SIGINT", () => {
      rl.close();
      resolve();
    });
  });
}

async function dispatch(action: string, until: string): Promise<void> {
  switch (action) {
    case "today":
      await todayCommand({});
      break;
    case "catchup":
      await catchupCommand({});
      break;
    case "catchup-range": {
      const s = await clack.text({ message: t("시작 날짜 (YYYY-MM-DD)"), initialValue: addDays(until, -29) });
      if (clack.isCancel(s)) break;
      const e = await clack.text({ message: t("끝 날짜 (YYYY-MM-DD)"), initialValue: until });
      if (clack.isCancel(e)) break;
      await catchupCommand({ since: (s as string).trim(), until: (e as string).trim() });
      break;
    }
    case "ui":
      await launchUiBackground();
      await new Promise((r) => setTimeout(r, 1200)); // URL 안내를 읽을 틈
      break;
    case "export":
      await exportCommand({ pdf: true, open: true });
      break;
    case "status":
      await statusCommand({});
      break;
    case "note": {
      const picked = await pickNoteDate();
      if (!picked) break;
      await noteCommand(picked.date, { project: picked.projectId });
      break;
    }
    case "open":
      openCommand();
      break;
    case "setup":
      await setupCommand();
      break;
  }
}
