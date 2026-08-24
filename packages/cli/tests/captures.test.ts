import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCollect } from "../src/collect.js";
import { appendCapture, capturePath, countCaptures, readCaptures } from "../src/lib/captures.js";
import { ConfigSchema } from "../src/lib/config.js";
import { computeStates } from "../src/lib/state.js";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "oln-captures-"));
  process.env.OLN_HOME = path.join(home, "olnhome");
  process.env.OLN_CLAUDE_DIR = path.join(home, "claude");
  process.env.OLN_CODEX_DIR = path.join(home, "codex");
  fs.mkdirSync(process.env.OLN_CLAUDE_DIR, { recursive: true });
  fs.mkdirSync(process.env.OLN_CODEX_DIR, { recursive: true });
});

afterEach(() => {
  delete process.env.OLN_HOME;
  delete process.env.OLN_CLAUDE_DIR;
  delete process.env.OLN_CODEX_DIR;
  fs.rmSync(home, { recursive: true, force: true });
});

const DAY = "2026-08-27";

const cfg = () =>
  ConfigSchema.parse({
    version: 1,
    author: { name: "T", gitAuthors: ["t"] },
    notesDir: path.join(home, "notes"),
    sources: { claudeCode: false, codex: false, git: false },
    projects: [{ id: "p1", title: "P1", repos: [], dirs: [] }],
  });

describe("captures 저장", () => {
  it("append하고 건수를 센다", () => {
    expect(readCaptures("p1", DAY)).toBeNull();
    expect(appendCapture("p1", DAY, "- physics 플래그 기본값 true로", "09:30")).toBe(1);
    expect(appendCapture("p1", DAY, "- empty scene 크래시는 null guard로 해결", "11:02")).toBe(2);
    const text = readCaptures("p1", DAY);
    expect(text).toContain("## 09:30");
    expect(text).toContain("## 11:02");
    expect(countCaptures("p1", DAY)).toBe(2);
  });
});

describe("captures → 수집 통합", () => {
  it("이벤트가 없어도 캡처가 있으면 raw가 만들어지고 최상단 섹션으로 들어간다", async () => {
    appendCapture("p1", DAY, "- 중요한 발견", "10:00");
    const summary = await runCollect(cfg(), { since: DAY, until: DAY });
    expect(summary.perProject.get("p1")?.has(DAY)).toBe(true);
    const raw = fs.readFileSync(path.join(process.env.OLN_HOME!, "raw", "p1", `${DAY}.md`), "utf8");
    expect(raw).toContain("## captures (직접 기록 — 반드시 반영)");
    expect(raw).toContain("중요한 발견");
  });

  it("캡처도 이벤트도 없는 날은 raw를 만들지 않는다", async () => {
    await runCollect(cfg(), { since: DAY, until: DAY });
    expect(fs.existsSync(path.join(process.env.OLN_HOME!, "raw", "p1", `${DAY}.md`))).toBe(false);
  });
});

describe("captures → 상태(activity)", () => {
  it("수집 전에도 캡처가 있는 날은 activity로 표시된다", async () => {
    appendCapture("p1", DAY, "- 메모", "10:00");
    expect(fs.existsSync(capturePath("p1", DAY))).toBe(true);
    const states = await computeStates(cfg(), DAY, DAY);
    expect(states.get("p1")?.get(DAY)?.activity).toBe(true);
  });
});
