import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureFirstRunVersion, loadAppState, saveAppState } from "../src/lib/app-state.js";
import {
  applyMigrations,
  ConfigSchema,
  loadConfig,
  MIGRATIONS,
  saveConfig,
} from "../src/lib/config.js";
import { compareVersions, maybeCheckForUpdates, updateNoticeLine } from "../src/lib/update.js";
import { parseChangelog, releasesBetween, takeWhatsNew } from "../src/lib/whatsnew.js";

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "oln-versioning-"));
  process.env.OLN_HOME = home;
  delete process.env.OLN_NO_UPDATE_CHECK;
});

afterEach(() => {
  delete process.env.OLN_HOME;
  delete process.env.OLN_NO_UPDATE_CHECK;
  delete MIGRATIONS[0];
  fs.rmSync(home, { recursive: true, force: true });
});

const VALID = {
  version: 1,
  author: { name: "T", gitAuthors: ["t"] },
  notesDir: "~/notes-test",
  projects: [{ id: "p1", title: "P1", repos: [], dirs: [] }],
};

const cfgPath = (): string => path.join(home, "config.json");
const writeCfg = (obj: unknown): void => {
  fs.writeFileSync(cfgPath(), typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
};
const readCfgRaw = (): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(cfgPath(), "utf8")) as Record<string, unknown>;

describe("config 버전 처리", () => {
  it("version이 없으면 v1로 취급한다", () => {
    const { version: _v, ...noVersion } = VALID;
    writeCfg(noVersion);
    expect(loadConfig().version).toBe(1);
  });

  it("미래 버전 config는 업데이트 안내와 함께 거부한다", () => {
    writeCfg({ ...VALID, version: 99 });
    expect(() => loadConfig()).toThrow(/openlabnote@latest/);
  });

  it("손상 JSON은 백업을 남기고 init을 안내한다", () => {
    writeCfg("{oops not json");
    expect(() => loadConfig()).toThrow(/oln init/);
    expect(fs.existsSync(`${cfgPath()}.corrupted.bak`)).toBe(true);
  });

  it("구버전 config는 마이그레이션 체인을 거쳐 백업과 함께 승격된다", () => {
    MIGRATIONS[0] = (raw) => ({ ...raw, migratedMark: true });
    writeCfg({ ...VALID, version: 0 });
    const cfg = loadConfig();
    expect(cfg.version).toBe(1);
    // 파일은 마이그레이션 결과로 다시 쓰였고, 원본은 백업으로 남는다
    const onDisk = readCfgRaw();
    expect(onDisk["version"]).toBe(1);
    expect(onDisk["migratedMark"]).toBe(true);
    const bak = JSON.parse(fs.readFileSync(`${cfgPath()}.v0.bak`, "utf8")) as Record<string, unknown>;
    expect(bak["version"]).toBe(0);
  });

  it("마이그레이션 경로가 없으면 버그로 명확히 실패한다", () => {
    writeCfg({ ...VALID, version: 0 });
    expect(() => loadConfig()).toThrow(/v0→v1/);
  });

  it("applyMigrations는 체인을 순서대로 적용한다", () => {
    const table = {
      1: (r: Record<string, unknown>) => ({ ...r, a: 1 }),
      2: (r: Record<string, unknown>) => ({ ...r, b: 2 }),
    };
    const out = applyMigrations({ version: 1 }, 1, 3, table);
    expect(out).toEqual({ version: 3, a: 1, b: 2 });
  });
});

describe("saveConfig 모르는 키 보존", () => {
  it("루트 수준의 모르는 키를 저장 시 이어받는다", () => {
    writeCfg({ ...VALID, futureField: { x: 1 } });
    const cfg = loadConfig();
    cfg.notesDir = "~/other";
    saveConfig(cfg);
    const onDisk = readCfgRaw();
    expect(onDisk["futureField"]).toEqual({ x: 1 });
    expect(onDisk["notesDir"]).toBe("~/other");
  });

  it("아는 키의 옵션 필드 삭제는 되살아나지 않는다", () => {
    writeCfg({ ...VALID, engineModel: "opus" });
    const cfg = loadConfig();
    delete cfg.engineModel;
    saveConfig(cfg);
    expect("engineModel" in readCfgRaw()).toBe(false);
  });
});

describe("compareVersions", () => {
  it("숫자 조각 단위로 비교한다", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
  });

  it("프리릴리스 접미사는 코어와 같게 취급한다", () => {
    expect(compareVersions("0.2.0-beta.1", "0.2.0")).toBe(0);
    expect(compareVersions("0.2.0-beta", "0.1.0")).toBe(1);
  });
});

describe("updateNoticeLine", () => {
  it("아는 최신 버전이 더 높을 때만 알림을 만든다", () => {
    expect(updateNoticeLine("0.1.0")).toBeNull();
    saveAppState({ latestKnownVersion: "0.2.0" });
    expect(updateNoticeLine("0.1.0")).toContain("0.2.0");
    expect(updateNoticeLine("0.2.0")).toBeNull();
    expect(updateNoticeLine("0.3.0")).toBeNull();
  });
});

describe("maybeCheckForUpdates 가드", () => {
  const cfg = ConfigSchema.parse(VALID);

  it("OLN_NO_UPDATE_CHECK면 아무것도 하지 않는다", () => {
    process.env.OLN_NO_UPDATE_CHECK = "1";
    maybeCheckForUpdates(cfg);
    expect(loadAppState().updateCheckedAt).toBeUndefined();
  });

  it("설정으로 끄면 아무것도 하지 않는다", () => {
    maybeCheckForUpdates({ ...cfg, updateCheck: false });
    expect(loadAppState().updateCheckedAt).toBeUndefined();
  });

  it("일주일 안에는 다시 확인하지 않는다", () => {
    const recent = new Date().toISOString();
    saveAppState({ updateCheckedAt: recent });
    maybeCheckForUpdates(cfg);
    expect(loadAppState().updateCheckedAt).toBe(recent);
  });
});

describe("whatsnew", () => {
  const SAMPLE = [
    "# Changelog",
    "intro",
    "## 0.2.0 (2026-09-01)",
    "",
    "- Added foo",
    "- Fixed bar",
    "",
    "## 0.1.0 (unreleased)",
    "",
    "- Initial release",
  ].join("\n");

  it("CHANGELOG 섹션과 불릿을 파싱한다", () => {
    const notes = parseChangelog(SAMPLE);
    expect(notes.map((n) => n.version)).toEqual(["0.2.0", "0.1.0"]);
    expect(notes[0]?.bullets).toEqual(["Added foo", "Fixed bar"]);
    expect(notes[1]?.bullets).toEqual(["Initial release"]);
  });

  it("releasesBetween은 prev 비포함·current 포함이다", () => {
    const notes = parseChangelog(SAMPLE);
    expect(releasesBetween(notes, "0.1.0", "0.2.0").map((n) => n.version)).toEqual(["0.2.0"]);
    expect(releasesBetween(notes, "0.0.1", "0.2.0").map((n) => n.version)).toEqual(["0.2.0", "0.1.0"]);
  });

  it("버전이 바뀐 첫 호출에만 새 소식을 주고 seen 처리한다", () => {
    saveAppState({ lastRunVersion: "0.0.1" });
    const wn = takeWhatsNew("0.1.0"); // 동봉 CHANGELOG의 0.1.0 섹션
    expect(wn?.title).toContain("0.0.1");
    expect(wn?.title).toContain("0.1.0");
    expect(wn && wn.bullets.length > 0).toBe(true);
    expect(loadAppState().lastRunVersion).toBe("0.1.0");
    expect(takeWhatsNew("0.1.0")).toBeNull();
  });

  it("다운그레이드는 조용히 기준만 갱신한다", () => {
    saveAppState({ lastRunVersion: "9.9.9" });
    expect(takeWhatsNew("0.1.0")).toBeNull();
    expect(loadAppState().lastRunVersion).toBe("0.1.0");
  });

  it("ensureFirstRunVersion은 상태가 없을 때만 기준점을 만든다", () => {
    ensureFirstRunVersion("0.1.0");
    expect(loadAppState().lastRunVersion).toBe("0.1.0");
    ensureFirstRunVersion("0.2.0");
    expect(loadAppState().lastRunVersion).toBe("0.1.0");
  });
});
