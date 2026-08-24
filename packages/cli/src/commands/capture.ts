import * as clack from "@clack/prompts";
import pc from "picocolors";
import { appendCapture } from "../lib/captures.js";
import { loadConfig, projectForPath } from "../lib/config.js";
import { isYmd, todayYmd } from "../lib/dates.js";
import { t } from "../lib/i18n.js";
import { die, isInteractive, nextLine, ok } from "../lib/ui.js";

export interface CaptureOptions {
  project?: string;
  date?: string;
}

/**
 * 순간 기록 — "오 이거 기록해둘 만하다" 싶은 그 자리에서 남긴다.
 * 남긴 내용은 그날 노트 작성 때 최우선으로 반드시 반영된다.
 */
export async function captureCommand(words: string[], opts: CaptureOptions): Promise<void> {
  const cfg = loadConfig();
  const date = opts.date ?? todayYmd();
  if (!isYmd(date)) die(t("날짜 형식이 잘못됐습니다 (YYYY-MM-DD)"), 'oln capture --date 2026-08-27 "…"');

  // 내용: 인자 → 파이프(stdin) → 대화형 입력
  let text = words.join(" ").trim();
  if (!text && !process.stdin.isTTY) text = (await readStdin()).trim();
  if (!text && isInteractive()) {
    const typed = await clack.text({
      message: t("기록할 내용 (여러 줄은 파이프로:  printf '%s\\n' \"- …\" | oln capture)"),
      validate: (v) => (v?.trim() ? undefined : t("입력하세요")),
    });
    if (clack.isCancel(typed)) return;
    text = (typed as string).trim();
  }
  if (!text) die(t("기록할 내용이 없습니다"), 'oln capture "physics 플래그 기본값을 true로 변경 — 크래시 사라짐"');

  // 과제: --project → 현재 폴더 매핑 → (1개뿐이면 그것) → 대화형 선택
  let projectId = opts.project;
  if (projectId && !cfg.projects.some((p) => p.id === projectId)) {
    die(t("없는 과제입니다: {p}", { p: projectId }), cfg.projects.map((p) => `oln capture -p ${p.id}`).join("  ·  "));
  }
  if (!projectId) projectId = projectForPath(cfg, process.cwd())?.id;
  if (!projectId && cfg.projects.length === 1) projectId = cfg.projects[0]?.id;
  if (!projectId) {
    if (!isInteractive()) die(t("과제를 정할 수 없습니다 — -p <과제id>를 지정하세요"), 'oln capture -p <과제id> "…"');
    const pick = await clack.select({
      message: t("어느 과제의 기록인가요? (현재 폴더가 과제에 속하지 않습니다)"),
      options: cfg.projects.map((p) => ({ value: p.id, label: `${p.id}  ${pc.dim(p.title)}` })),
    });
    if (clack.isCancel(pick)) return;
    projectId = pick as string;
  }

  const hm = new Date().toTimeString().slice(0, 5);
  const total = appendCapture(projectId, date, text, hm);
  ok(t("기록됨: {p} · {date} ({n}건째) — 노트 정리 때 반드시 반영됩니다", { p: projectId, date, n: total }));
  nextLine("oln today", 'oln capture "…"');
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let s = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c: string) => {
      if (s.length < 64 * 1024) s += c;
    });
    process.stdin.on("end", () => resolve(s));
    process.stdin.on("error", () => resolve(s));
  });
}
