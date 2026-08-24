import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { instructionOrigin, loadInstruction, userInstructionPath } from "../src/compose/engine.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oln-inst-"));
  process.env.OLN_HOME = tmp;
});

afterEach(() => {
  delete process.env.OLN_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("instructions 오버라이드", () => {
  it("기본: 패키지 내장 지침을 로드한다", () => {
    expect(instructionOrigin("WRITE")).toBe("default");
    expect(loadInstruction("WRITE")).toContain("연구노트 일일 작성 지침");
  });

  it("~/.openlabnote/instructions/ 오버라이드가 우선한다", () => {
    const custom = userInstructionPath("WRITE");
    fs.mkdirSync(path.dirname(custom), { recursive: true });
    fs.writeFileSync(custom, "# 내 맞춤 지침\n{{DATE_HEADING}}");
    expect(instructionOrigin("WRITE")).toBe("custom");
    expect(loadInstruction("WRITE")).toContain("내 맞춤 지침");
  });

  it("오버라이드를 지우면 기본으로 복귀한다", () => {
    const custom = userInstructionPath("POLISH");
    fs.mkdirSync(path.dirname(custom), { recursive: true });
    fs.writeFileSync(custom, "custom polish");
    expect(instructionOrigin("POLISH")).toBe("custom");
    fs.rmSync(custom);
    expect(instructionOrigin("POLISH")).toBe("default");
    expect(loadInstruction("POLISH")).toContain("문장 다듬기");
  });
});
