import fs from "node:fs";
import path from "node:path";
import { rawPath } from "../collect.js";
import { notePath, type Config, type Project } from "../lib/config.js";
import type { Ymd } from "../lib/dates.js";
import { composeDate, EngineError } from "./engine.js";
import type { LintIssue } from "../note/lint.js";

export interface ComposeOutcome {
  projectId: string;
  date: Ymd;
  status: "written" | "draft" | "skipped-exists" | "no-raw" | "engine-error";
  path?: string;
  md?: string;
  issues?: LintIssue[];
  error?: { message: string; fix: string };
  elapsedMs?: number;
}

/**
 * 한 (과제, 날짜)의 노트를 엔진으로 작성해 저장한다.
 * - lint 통과 → <date>.md (기존 파일은 .bak으로 백업)
 * - lint 실패(재시도 후에도) → <date>.draft.md 로 저장해 사람이 고칠 수 있게 남긴다
 */
export async function composeAndSave(
  cfg: Config,
  project: Project,
  date: Ymd,
  opts: { force?: boolean } = {},
): Promise<ComposeOutcome> {
  const raw = rawPath(project.id, date);
  if (!fs.existsSync(raw)) {
    return { projectId: project.id, date, status: "no-raw" };
  }
  const target = notePath(cfg, project.id, date);
  if (fs.existsSync(target) && !opts.force) {
    return { projectId: project.id, date, status: "skipped-exists", path: target };
  }

  const rawText = fs.readFileSync(raw, "utf8");
  let result;
  try {
    result = await composeDate(cfg, project, date, rawText);
  } catch (e) {
    if (e instanceof EngineError) {
      return { projectId: project.id, date, status: "engine-error", error: { message: e.message, fix: e.fix } };
    }
    throw e;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  const draftPath = target.replace(/\.md$/, ".draft.md");

  if (result.lint.ok) {
    if (fs.existsSync(target)) fs.copyFileSync(target, target + ".bak");
    fs.writeFileSync(target, result.md, "utf8");
    if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
    return {
      projectId: project.id,
      date,
      status: "written",
      path: target,
      md: result.md,
      issues: result.lint.issues,
      elapsedMs: result.elapsedMs,
    };
  }

  fs.writeFileSync(draftPath, result.md, "utf8");
  return {
    projectId: project.id,
    date,
    status: "draft",
    path: draftPath,
    md: result.md,
    issues: result.lint.issues,
    elapsedMs: result.elapsedMs,
  };
}
