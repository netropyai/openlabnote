import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completePath } from "../src/lib/path-input.js";

// listSshHosts는 ~/.ssh/config에 의존 — 실제 홈 기준으로도 안전하게 동작해야 하고,
// 여기서는 홈 하위 임시 폴더로 완성 결과만 검증한다.

let tmpName: string;

beforeEach(() => {
  // 홈 바로 아래에 예측 가능한 임시 디렉토리 생성
  tmpName = `oln-tab-test-${process.pid}`;
  fs.mkdirSync(path.join(os.homedir(), tmpName, "alpha"), { recursive: true });
  fs.mkdirSync(path.join(os.homedir(), tmpName, "beta"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(path.join(os.homedir(), tmpName), { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("completePath", () => {
  it("'~' 단독은 '~/'로 완성한다", () => {
    const [cands] = completePath("~");
    expect(cands).toEqual(["~/"]);
  });

  it("'~/…' 완성 결과가 ~ 접두를 보존한다", () => {
    const [cands] = completePath(`~/${tmpName}/`);
    expect(cands).toContain(`~/${tmpName}/alpha/`);
    expect(cands).toContain(`~/${tmpName}/beta/`);
    for (const c of cands) expect(c.startsWith("~/")).toBe(true);
  });

  it("접두사로 필터링한다", () => {
    const [cands] = completePath(`~/${tmpName}/al`);
    expect(cands).toEqual([`~/${tmpName}/alpha/`]);
  });

  it("원격(호스트:) 입력은 완성하지 않는다", () => {
    const [cands] = completePath("serverA:~/dev/x");
    expect(cands).toEqual([]);
  });

  it("존재하지 않는 디렉토리는 빈 후보", () => {
    const [cands] = completePath(`~/${tmpName}/nope/zz`);
    expect(cands).toEqual([]);
  });
});
