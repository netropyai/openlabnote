import * as clack from "@clack/prompts";
import fs from "node:fs";
import { configExists, loadConfig } from "../lib/config.js";
import { contractTilde, expandTilde, olnHome } from "../lib/paths.js";
import { t } from "../lib/i18n.js";
import { die, info, isInteractive, nextLine, ok } from "../lib/ui.js";

export interface ResetOptions {
  notes?: boolean;
  yes?: boolean;
}

/**
 * 처음 상태로 되돌린다.
 * - 기본: ~/.openlabnote (설정 + raw 덤프) 삭제
 * - --notes: 노트 폴더(notesDir)까지 삭제 — 정본 노트가 사라지므로 별도 플래그
 */
export async function resetCommand(opts: ResetOptions): Promise<void> {
  const home = olnHome();
  const targets: { path: string; label: string }[] = [];

  if (fs.existsSync(home)) targets.push({ path: home, label: t("설정·raw·직접 기록(captures) ({path})", { path: contractTilde(home) }) });

  let notesDir: string | null = null;
  if (opts.notes) {
    if (!configExists()) {
      info(t("설정이 없어 노트 폴더 위치를 알 수 없습니다 — 노트는 직접 지우세요"));
    } else {
      notesDir = expandTilde(loadConfig().notesDir);
      if (fs.existsSync(notesDir)) targets.push({ path: notesDir, label: t("노트 폴더 ({path}) ⚠ 정본 노트 삭제", { path: contractTilde(notesDir) }) });
    }
  }

  if (targets.length === 0) {
    ok(t("지울 것이 없습니다 — 이미 처음 상태입니다"));
    nextLine(t("oln  — 초기 설정 시작"));
    return;
  }

  if (!opts.yes) {
    if (!isInteractive()) die(t("삭제 확인이 필요합니다"), t("oln reset --yes  (노트까지: oln reset --notes --yes)"));
    for (const target of targets) info(t("삭제 예정: {label}", { label: target.label }));
    const go = await clack.confirm({ message: t("위 항목을 삭제하고 처음 상태로 되돌릴까요?"), initialValue: false });
    if (clack.isCancel(go) || !go) {
      info(t("취소됨"));
      return;
    }
  }

  for (const target of targets) {
    fs.rmSync(target.path, { recursive: true, force: true });
    ok(t("삭제됨: {label}", { label: target.label }));
  }
  nextLine(t("oln  — 초기 설정부터 다시 시작"));
}
