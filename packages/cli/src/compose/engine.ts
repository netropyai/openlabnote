import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Config, Project } from "../lib/config.js";
import { ymdToHeading, type Ymd } from "../lib/dates.js";
import { olnHome } from "../lib/paths.js";
import { t } from "../lib/i18n.js";
import { lintNote, type LintResult } from "../note/lint.js";

const LANGUAGE_RULES: Record<Config["language"], string> = {
  ko: "한국어로 쓴다. 기술 용어·파일명·식별자·명령어는 원문(영문) 그대로 둔다.",
  en: "Write in terse research-log English. No Korean.",
  mixed:
    "기술 내용은 간결한 research-log English로 쓴다. `결정:` `원인:` `확인` `보류` 같은 짧은 한국어 마커는 허용. 번역투 문장 금지.",
};

function bundledInstructionsDir(): string {
  // dist/compose/engine.js → packages/cli/instructions
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "instructions");
}

/** 사용자 오버라이드 위치: ~/.openlabnote/instructions/<NAME>.md */
export function userInstructionPath(name: InstructionName): string {
  return path.join(olnHome(), "instructions", `${name}.md`);
}

export function bundledInstructionPath(name: InstructionName): string {
  return path.join(bundledInstructionsDir(), `${name}.md`);
}

export type InstructionName = "WRITE" | "POLISH" | "CONCISE";

/** 지침 로드 — 사용자 오버라이드가 있으면 그것을, 없으면 내장본을 쓴다 */
export function loadInstruction(name: InstructionName): string {
  const custom = userInstructionPath(name);
  if (fs.existsSync(custom)) return fs.readFileSync(custom, "utf8");
  return fs.readFileSync(bundledInstructionPath(name), "utf8");
}

export function instructionOrigin(name: InstructionName): "custom" | "default" {
  return fs.existsSync(userInstructionPath(name)) ? "custom" : "default";
}

/** 사용 가능한 엔진 감지 */
export function detectClaudeCli(): boolean {
  const res = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 10_000 });
  return res.status === 0;
}

export function detectCodexCli(): boolean {
  const res = spawnSync("codex", ["--version"], { encoding: "utf8", timeout: 10_000 });
  return res.status === 0;
}

export const ENGINE_LABEL: Record<Exclude<Config["engine"], "none">, string> = {
  claude: "claude -p",
  codex: "codex exec",
};

export function buildWritePrompt(cfg: Config, project: Project, date: Ymd, rawText: string): string {
  const template = loadInstruction("WRITE");
  const filled = template
    .replaceAll("{{DATE_HEADING}}", ymdToHeading(date))
    .replaceAll("{{DATE}}", date)
    .replaceAll("{{PROJECT_TITLE}}", project.title)
    .replaceAll("{{LANGUAGE_RULES}}", LANGUAGE_RULES[cfg.language]);
  return `${filled}\n\n[RAW]\n${rawText}\n\n[OUTPUT]\n위 규칙에 맞는 노트 마크다운만 출력하라.`;
}

export interface ComposeResult {
  md: string;
  lint: LintResult;
  attempts: number;
  elapsedMs: number;
}

export class EngineError extends Error {
  constructor(
    message: string,
    public readonly fix: string,
  ) {
    super(message);
  }
}

interface ProcResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  notFound: boolean;
}

/** 비동기 프로세스 실행 — 이벤트 루프를 막지 않아 스피너·경과 표시가 살아있다 */
function runProc(cmd: string, args: string[], input: string, timeoutMs: number): Promise<ProcResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: olnHome(), env: { ...process.env, CLAUDE_CODE_DISABLE_AUTOUPDATE: "1" } });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let notFound = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") notFound = true;
      clearTimeout(timer);
      resolve({ status: -1, stdout, stderr: stderr || e.message, timedOut, notFound });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut, notFound });
    });
    child.stdin.on("error", () => {});
    child.stdin.write(input);
    child.stdin.end();
  });
}

async function runClaude(prompt: string, model?: string): Promise<string> {
  // 엔진 세션이 사용자 과제로 매핑되지 않도록 runProc이 oln 홈에서 실행한다
  const args = ["-p", ...(model ? ["--model", model] : [])];
  const res = await runProc("claude", args, prompt, 300_000);
  if (res.notFound) {
    throw new EngineError(
      t("claude CLI를 찾을 수 없습니다"),
      t("https://claude.com/claude-code 에서 설치 후  oln setup engine  으로 다시 설정"),
    );
  }
  if (res.timedOut) {
    throw new EngineError(t("엔진 응답이 5분을 초과했습니다"), t("다시 실행하거나 raw가 과도하게 큰지 확인 (oln collect)"));
  }
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim().slice(0, 300);
    throw new EngineError(t("claude -p 실행 실패: {err}", { err: err || t("원인 미상") }), t("claude 를 단독 실행해 로그인 상태를 확인하세요"));
  }
  return res.stdout;
}

async function runCodex(prompt: string, model?: string): Promise<string> {
  const outFile = path.join(os.tmpdir(), `oln-codex-${process.pid}-${Math.random().toString(36).slice(2)}.md`);
  try {
    const res = await runProc(
      "codex",
      [
        "exec",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        ...(model ? ["-c", `model=${JSON.stringify(model)}`] : []),
        "--output-last-message",
        outFile,
        "-",
      ],
      prompt,
      300_000,
    );
    if (res.notFound) {
      throw new EngineError(t("codex CLI를 찾을 수 없습니다"), t("codex 설치 후  oln setup engine  으로 다시 설정"));
    }
    if (res.timedOut) {
      throw new EngineError(t("엔진 응답이 5분을 초과했습니다"), t("다시 실행하거나 raw가 과도하게 큰지 확인 (oln collect)"));
    }
    if (res.status !== 0 || !fs.existsSync(outFile)) {
      const err = (res.stderr || res.stdout || "").trim().slice(0, 300);
      throw new EngineError(t("codex exec 실행 실패: {err}", { err: err || t("원인 미상") }), t("codex 를 단독 실행해 로그인 상태를 확인하세요"));
    }
    return fs.readFileSync(outFile, "utf8");
  } finally {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  }
}

function runEngine(engine: "claude" | "codex", prompt: string, model?: string): Promise<string> {
  return engine === "claude" ? runClaude(prompt, model) : runCodex(prompt, model);
}

/** 엔진 출력 정리: 코드펜스 래핑 제거, 헤딩 이전 잡담 제거 */
export function cleanupEngineOutput(out: string): string {
  let text = out.trim();
  const fence = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/m.exec(text);
  if (fence && fence[1] && fence[1].includes("## @")) text = fence[1].trim();
  const idx = text.indexOf("## @");
  if (idx > 0) text = text.slice(idx);
  return text.trim() + "\n";
}

/**
 * 한 날짜의 노트를 작성한다. lint 실패 시 오류 목록을 붙여 1회 재시도.
 */
export async function composeDate(cfg: Config, project: Project, date: Ymd, rawText: string): Promise<ComposeResult> {
  if (cfg.engine === "none") {
    throw new EngineError(
      t("작성 엔진이 설정되지 않았습니다"),
      t("oln setup engine  으로 claude/codex를 선택하거나, Claude Code 안에서 /labnote 를 사용하세요"),
    );
  }
  const engine = cfg.engine;
  const started = Date.now();
  const prompt = buildWritePrompt(cfg, project, date, rawText);

  let md = cleanupEngineOutput(await runEngine(engine, prompt, cfg.engineModel));
  let lint = lintNote(md, { expectedDate: date, checkFigFiles: true });
  let attempts = 1;

  if (!lint.ok) {
    const feedback = lint.issues
      .filter((i) => i.severity === "error")
      .map((i) => `- [${i.code}] ${i.message}`)
      .join("\n");
    const retryPrompt =
      `${prompt}\n\n[이전 출력]\n${md}\n\n[검사 실패]\n${feedback}\n\n` +
      `위 오류를 모두 고친 노트 마크다운만 다시 출력하라.`;
    md = cleanupEngineOutput(await runEngine(engine, retryPrompt, cfg.engineModel));
    lint = lintNote(md, { expectedDate: date, checkFigFiles: true });
    attempts = 2;
  }

  return { md, lint, attempts, elapsedMs: Date.now() - started };
}
