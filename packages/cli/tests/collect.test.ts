import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCollect } from "../src/collect.js";
import { ConfigSchema, type Config } from "../src/lib/config.js";

let tmp: string;
let cfg: Config;

/** 가짜 Claude Code 세션 JSONL 생성 (실제 포맷 기반 픽스처) */
function writeClaudeSession(dir: string, session: string, records: object[]): void {
  const d = path.join(tmp, "claude-projects", dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `${session}.jsonl`), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

/** 가짜 Codex 세션 JSONL 생성 */
function writeCodexSession(date: string, name: string, records: object[]): void {
  const [y, m, day] = date.split("-");
  const d = path.join(tmp, "codex-sessions", y!, m!, day!);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `${name}.jsonl`), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

/** 가짜 git repo + 특정 날짜 커밋 */
function makeRepo(name: string, commits: { date: string; msg: string; author: string }[]): string {
  const repo = path.join(tmp, name);
  fs.mkdirSync(repo, { recursive: true });
  const run = (cmd: string, env: Record<string, string> = {}): void => {
    execSync(cmd, { cwd: repo, env: { ...process.env, ...env }, stdio: "pipe" });
  };
  run("git init -q");
  run('git config user.email "t@t.t" && git config user.name "tester"');
  let i = 0;
  for (const c of commits) {
    i += 1;
    fs.writeFileSync(path.join(repo, `f${i}.txt`), c.msg);
    run("git add .");
    run(`git commit -q -m "${c.msg}" --author="${c.author} <a@a.a>"`, {
      GIT_AUTHOR_DATE: `${c.date}T12:00:00+09:00`,
      GIT_COMMITTER_DATE: `${c.date}T12:00:00+09:00`,
    });
  }
  return repo;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oln-test-"));
  process.env.OLN_HOME = path.join(tmp, "oln-home");
  process.env.OLN_CLAUDE_DIR = path.join(tmp, "claude-projects");
  process.env.OLN_CODEX_DIR = path.join(tmp, "codex-sessions");
});

afterEach(() => {
  delete process.env.OLN_HOME;
  delete process.env.OLN_CLAUDE_DIR;
  delete process.env.OLN_CODEX_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeConfig(repoPath: string, workDir: string): Config {
  return ConfigSchema.parse({
    version: 1,
    author: { name: "Tester", gitAuthors: ["euijin"] },
    notesDir: path.join(tmp, "notes"),
    language: "mixed",
    engine: "none",
    sources: { claudeCode: true, codex: true, git: true },
    projects: [{ id: "proj-a", title: "과제 A", repos: [repoPath], dirs: [workDir] }],
    sink: { type: "local" },
  });
}

describe("runCollect (픽스처 통합)", () => {
  it("claude-code 프롬프트를 과제로 매핑해 raw를 만든다", async () => {
    const workDir = path.join(tmp, "work", "proj-a");
    fs.mkdirSync(workDir, { recursive: true });
    writeClaudeSession("-work-proj-a", "s1", [
      { type: "user", timestamp: "2026-08-21T09:00:00.000Z", cwd: workDir, sessionId: "s1", isSidechain: false, message: { role: "user", content: "physics server 플래그를 headless로 바꿔줘" } },
      { type: "user", timestamp: "2026-08-21T09:05:00.000Z", cwd: workDir, sessionId: "s1", isSidechain: false, message: { role: "user", content: [{ type: "tool_result", content: "..." }] } },
      { type: "assistant", timestamp: "2026-08-21T09:06:00.000Z", cwd: workDir, sessionId: "s1", isSidechain: false, message: { role: "assistant", content: [{ type: "text", text: "플래그를 변경했습니다" }] } },
      { type: "user", timestamp: "2026-08-21T10:00:00.000Z", cwd: "/somewhere/else", sessionId: "s1", isSidechain: false, message: { role: "user", content: "다른 프로젝트 질문" } },
    ]);
    cfg = makeConfig(path.join(tmp, "no-repo"), workDir);

    const summary = await runCollect(cfg, { since: "2026-08-21", until: "2026-08-21" });
    const stats = summary.perProject.get("proj-a")?.get("2026-08-21");
    expect(stats?.prompts).toBe(1); // tool_result 배열은 제외
    expect(stats?.responses).toBe(1);
    expect(summary.unmapped.size).toBeGreaterThan(0); // /somewhere/else

    const raw = fs.readFileSync(path.join(process.env.OLN_HOME!, "raw", "proj-a", "2026-08-21.md"), "utf8");
    expect(raw).toContain("physics server 플래그");
    expect(raw).toContain("마지막 응답 발췌");
    expect(raw).toContain("로컬 전용, 업로드 금지");
  });

  it("중복 프롬프트와 노이즈 래퍼를 제거한다", async () => {
    const workDir = path.join(tmp, "work", "proj-a");
    fs.mkdirSync(workDir, { recursive: true });
    const prompt = { type: "user", timestamp: "2026-08-21T09:00:00.000Z", cwd: workDir, sessionId: "s1", message: { role: "user", content: "같은 프롬프트" } };
    writeClaudeSession("-work-proj-a", "s1", [
      prompt,
      { ...prompt, timestamp: "2026-08-21T09:00:01.000Z" },
      { type: "user", timestamp: "2026-08-21T09:00:02.000Z", cwd: workDir, sessionId: "s1", message: { role: "user", content: "<local-command-caveat>Caveat: ...</local-command-caveat>" } },
      { type: "user", timestamp: "2026-08-21T09:00:03.000Z", cwd: workDir, sessionId: "s1", message: { role: "user", content: "<command-name>/model</command-name>" } },
    ]);
    cfg = makeConfig(path.join(tmp, "no-repo"), workDir);

    const summary = await runCollect(cfg, { since: "2026-08-21", until: "2026-08-21" });
    expect(summary.perProject.get("proj-a")?.get("2026-08-21")?.prompts).toBe(1);
  });

  it("codex user_message를 수집하고 turn_context cwd를 따른다", async () => {
    const workDir = path.join(tmp, "work", "proj-a");
    fs.mkdirSync(workDir, { recursive: true });
    writeCodexSession("2026/08/21".replace(/\//g, "-"), "rollout-1", [
      { timestamp: "2026-08-21T01:00:00.000Z", type: "session_meta", payload: { id: "x", cwd: "/tmp/elsewhere" } },
      { timestamp: "2026-08-21T01:01:00.000Z", type: "turn_context", payload: { cwd: workDir } },
      { timestamp: "2026-08-21T01:02:00.000Z", type: "event_msg", payload: { type: "user_message", message: "codex에서 작업한 프롬프트" } },
      { timestamp: "2026-08-21T01:03:00.000Z", type: "event_msg", payload: { type: "agent_message", message: "완료했습니다" } },
    ]);
    cfg = makeConfig(path.join(tmp, "no-repo"), workDir);

    const summary = await runCollect(cfg, { since: "2026-08-21", until: "2026-08-21" });
    const stats = summary.perProject.get("proj-a")?.get("2026-08-21");
    expect(stats?.prompts).toBe(1);
    expect(stats?.responses).toBe(1);
  });

  it("git 커밋을 author 필터로 수집한다", async () => {
    const repo = makeRepo("repo-a", [
      { date: "2026-08-21", msg: "feat: add collector", author: "euijin jung" },
      { date: "2026-08-21", msg: "fix: someone else", author: "other person" },
      { date: "2026-08-19", msg: "chore: out of range", author: "euijin jung" },
    ]);
    const workDir = path.join(tmp, "unused");
    fs.mkdirSync(workDir, { recursive: true });
    cfg = makeConfig(repo, workDir);

    const summary = await runCollect(cfg, { since: "2026-08-21", until: "2026-08-21" });
    const stats = summary.perProject.get("proj-a")?.get("2026-08-21");
    expect(stats?.commits).toBe(1);
    const raw = fs.readFileSync(path.join(process.env.OLN_HOME!, "raw", "proj-a", "2026-08-21.md"), "utf8");
    expect(raw).toContain("feat: add collector");
    expect(raw).not.toContain("someone else");
  });

  it("멱등: 기간 내 이벤트가 사라지면 raw도 제거된다", async () => {
    const workDir = path.join(tmp, "work", "proj-a");
    fs.mkdirSync(workDir, { recursive: true });
    const sessionFile = () =>
      writeClaudeSession("-work-proj-a", "s1", [
        { type: "user", timestamp: "2026-08-21T09:00:00.000Z", cwd: workDir, sessionId: "s1", message: { role: "user", content: "프롬프트" } },
      ]);
    sessionFile();
    cfg = makeConfig(path.join(tmp, "no-repo"), workDir);
    await runCollect(cfg, { since: "2026-08-21", until: "2026-08-21" });
    const rawFile = path.join(process.env.OLN_HOME!, "raw", "proj-a", "2026-08-21.md");
    expect(fs.existsSync(rawFile)).toBe(true);

    // 소스 제거 후 재수집 → raw 제거
    fs.rmSync(path.join(tmp, "claude-projects"), { recursive: true, force: true });
    await runCollect(cfg, { since: "2026-08-21", until: "2026-08-21" });
    expect(fs.existsSync(rawFile)).toBe(false);
  });
});
