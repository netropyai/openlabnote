import os from "node:os";
import path from "node:path";

/** openlabnote가 자체 상태를 두는 홈 디렉토리 (raw 덤프·설정) */
export function olnHome(): string {
  return process.env.OLN_HOME ?? path.join(os.homedir(), ".openlabnote");
}

export function configPath(): string {
  return path.join(olnHome(), "config.json");
}

export function rawDir(projectId?: string): string {
  const base = path.join(olnHome(), "raw");
  return projectId ? path.join(base, projectId) : base;
}

/** `~/…` 표기를 절대 경로로 확장 */
export function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** 절대 경로를 `~/…` 표기로 축약 (출력용) */
export function contractTilde(p: string): string {
  const home = os.homedir();
  if (p === home) return "~";
  if (p.startsWith(home + path.sep)) return "~" + p.slice(home.length);
  return p;
}

export function claudeProjectsDir(): string {
  return process.env.OLN_CLAUDE_DIR ?? path.join(os.homedir(), ".claude", "projects");
}

export function codexSessionsDir(): string {
  return process.env.OLN_CODEX_DIR ?? path.join(os.homedir(), ".codex", "sessions");
}
