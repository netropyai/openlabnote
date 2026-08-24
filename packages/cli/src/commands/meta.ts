import fs from "node:fs";
import path from "node:path";
import {
  bundledInstructionPath,
  instructionOrigin,
  loadInstruction,
  userInstructionPath,
  type InstructionName,
} from "../compose/engine.js";
import { loadConfig } from "../lib/config.js";
import { openFileForEdit } from "../lib/editor.js";
import { configPath, contractTilde, expandTilde, olnHome, rawDir } from "../lib/paths.js";
import { t } from "../lib/i18n.js";
import { die, dim, info, nextLine, ok } from "../lib/ui.js";

export interface InstructionsOptions {
  edit?: boolean;
  reset?: boolean;
}

function parseName(name: string): InstructionName {
  const upper = name.toUpperCase();
  if (upper !== "WRITE" && upper !== "POLISH" && upper !== "CONCISE") {
    die(t("알 수 없는 지침: {name}", { name }), "oln instructions write|polish|concise [--edit|--reset]");
  }
  return upper as InstructionName;
}

/**
 * [저수준] 작성 지침 관리.
 * - 기본: 유효 지침 원문 출력 (하네스 스킬이 읽어 따름) — 오버라이드가 있으면 그것
 * - --edit: 내 지침 사본(~/.openlabnote/instructions/)을 만들어 에디터로 열기
 * - --reset: 오버라이드를 지우고 기본 지침으로 복귀
 */
export function instructionsCommand(name: string, opts: InstructionsOptions = {}): void {
  const n = parseName(name);
  const customPath = userInstructionPath(n);

  if (opts.reset) {
    if (fs.existsSync(customPath)) {
      fs.rmSync(customPath);
      ok(t("커스텀 지침 삭제 — 기본 지침으로 복귀 ({name})", { name: n }));
    } else {
      info(t("커스텀 지침이 없습니다 — 이미 기본 지침 사용 중 ({name})", { name: n }));
    }
    nextLine(t("oln instructions {name}  — 현재 지침 확인", { name }));
    return;
  }

  if (opts.edit) {
    if (!fs.existsSync(customPath)) {
      fs.mkdirSync(path.dirname(customPath), { recursive: true });
      fs.copyFileSync(bundledInstructionPath(n), customPath);
      ok(t("기본 지침을 복사했습니다: {path}", { path: contractTilde(customPath) }));
    }
    if (!openFileForEdit(customPath)) {
      info(t("편집기를 열 수 없습니다 — 직접 여세요: {path}", { path: contractTilde(customPath) }));
    }
    info(t("이후 노트 작성(oln today, /labnote)에 즉시 반영됩니다."));
    nextLine(t("oln instructions {name} --reset  — 기본으로 되돌리기", { name }));
    return;
  }

  // stdout은 지침 원문만 (스킬·파이프 소비) — 출처 표시는 stderr로
  if (process.stderr.isTTY) {
    const origin = instructionOrigin(n) === "custom" ? t("커스텀 ({path})", { path: contractTilde(customPath) }) : t("기본 (패키지 내장)");
    process.stderr.write(dim(t("# 출처: {origin}", { origin }) + "\n"));
  }
  process.stdout.write(loadInstruction(n));
}

/** [저수준] 해석된 설정 출력 — 하네스 스킬·스크립트용 */
export function configCommand(): void {
  const cfg = loadConfig();
  console.log(
    JSON.stringify(
      {
        ...cfg,
        resolved: {
          configPath: configPath(),
          olnHome: olnHome(),
          rawDir: rawDir(),
          notesDirAbsolute: expandTilde(cfg.notesDir),
          instructions: {
            write: instructionOrigin("WRITE"),
            polish: instructionOrigin("POLISH"),
            concise: instructionOrigin("CONCISE"),
          },
        },
      },
      null,
      2,
    ),
  );
}
