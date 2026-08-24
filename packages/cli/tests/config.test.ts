import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigSchema, isRemoteEntry, parseRepoEntry, projectForPath } from "../src/lib/config.js";

const cfg = ConfigSchema.parse({
  version: 1,
  author: { name: "T", gitAuthors: ["t"] },
  notesDir: "~/notes",
  projects: [
    { id: "a", title: "A", repos: ["~/dev/repo-a"], dirs: [] },
    { id: "a-sub", title: "A sub", repos: ["~/dev/repo-a/subpkg"], dirs: [] },
    { id: "b", title: "B", repos: [], dirs: ["~/work/b"] },
  ],
});

const home = os.homedir();

describe("projectForPath", () => {
  it("repo 하위 경로를 매핑한다", () => {
    expect(projectForPath(cfg, path.join(home, "dev/repo-a/src"))?.id).toBe("a");
  });
  it("가장 긴 프리픽스가 이긴다", () => {
    expect(projectForPath(cfg, path.join(home, "dev/repo-a/subpkg/x"))?.id).toBe("a-sub");
  });
  it("dirs도 매핑한다", () => {
    expect(projectForPath(cfg, path.join(home, "work/b/deep"))?.id).toBe("b");
  });
  it("밖의 경로는 null", () => {
    expect(projectForPath(cfg, "/unrelated/path")).toBeNull();
  });
  it("프리픽스 문자열 장난에 속지 않는다 (repo-ab ≠ repo-a)", () => {
    expect(projectForPath(cfg, path.join(home, "dev/repo-ab"))).toBeNull();
  });
});

describe("parseRepoEntry", () => {
  it("scp 스타일 원격 항목을 파싱한다", () => {
    expect(parseRepoEntry("serverA:~/dev/genixsim")).toEqual({ host: "serverA", path: "~/dev/genixsim" });
    expect(parseRepoEntry("me@10.0.0.2:/opt/work")).toEqual({ host: "me@10.0.0.2", path: "/opt/work" });
  });
  it("로컬 경로는 host 없이 반환한다", () => {
    expect(parseRepoEntry("~/dev/repo")).toEqual({ path: "~/dev/repo" });
    expect(parseRepoEntry("/abs/path")).toEqual({ path: "/abs/path" });
  });
  it("경로가 ~ 또는 /로 시작하지 않으면 원격으로 보지 않는다", () => {
    expect(isRemoteEntry("serverA:relative/path")).toBe(false);
    expect(isRemoteEntry("serverA:~/x")).toBe(true);
  });
});

describe("projectForPath (원격)", () => {
  const rcfg = ConfigSchema.parse({
    version: 1,
    author: { name: "T", gitAuthors: ["t"] },
    notesDir: "~/notes",
    projects: [
      { id: "ra", title: "RA", repos: ["serverA:~/dev/genixsim"], dirs: [] },
      { id: "rb", title: "RB", repos: [], dirs: ["serverB:/data/work"] },
    ],
    remotes: [{ host: "serverA" }, { host: "serverB" }],
  });
  const homes = new Map([["serverA", "/home/euijin"]]);

  it("원격 ~ 항목을 원격 홈으로 확장해 매핑한다", () => {
    expect(projectForPath(rcfg, "/home/euijin/dev/genixsim/src", "serverA", homes)?.id).toBe("ra");
  });
  it("절대경로 원격 항목은 홈 없이도 매핑한다", () => {
    expect(projectForPath(rcfg, "/data/work/deep", "serverB", homes)?.id).toBe("rb");
  });
  it("다른 호스트의 같은 경로는 매핑하지 않는다", () => {
    expect(projectForPath(rcfg, "/home/euijin/dev/genixsim", "serverB", homes)).toBeNull();
  });
  it("로컬 이벤트는 원격 항목에 매핑되지 않는다", () => {
    expect(projectForPath(rcfg, "/home/euijin/dev/genixsim")).toBeNull();
  });
  it("원격 홈을 모르면 ~ 항목은 비교 불가로 건너뛴다", () => {
    expect(projectForPath(rcfg, "/home/x/dev/genixsim", "serverA", new Map())).toBeNull();
  });
});

describe("ConfigSchema", () => {
  it("잘못된 과제 id를 거부한다", () => {
    const r = ConfigSchema.safeParse({
      version: 1,
      author: { name: "T", gitAuthors: ["t"] },
      notesDir: "~/n",
      projects: [{ id: "한글아이디", title: "X" }],
    });
    expect(r.success).toBe(false);
  });
  it("빈 projects를 거부한다", () => {
    const r = ConfigSchema.safeParse({
      version: 1,
      author: { name: "T", gitAuthors: ["t"] },
      notesDir: "~/n",
      projects: [],
    });
    expect(r.success).toBe(false);
  });
});
