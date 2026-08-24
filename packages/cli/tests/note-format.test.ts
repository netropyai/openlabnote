import { describe, expect, it } from "vitest";
import { parseNote, bulletCount } from "../src/note/format.js";
import { lintNote } from "../src/note/lint.js";

const GOOD = `## @August 21, 2026

### Physics server flags
- physics server 기동 플래그를 --headless 기본값으로 변경
- 결정: eval 배너는 stderr로 — 로그 파싱 파이프라인과 충돌 방지

### Mixed-rig eval
- SNU-EADv1.0 드라이버 통합, eval 시간 9.4 → 1.7s
`;

describe("parseNote", () => {
  it("정상 노트를 구조로 파싱한다", () => {
    const note = parseNote(GOOD);
    expect(note.headingCount).toBe(1);
    expect(note.date).toBe("2026-08-21");
    expect(note.topics.map((t) => t.title)).toEqual(["Physics server flags", "Mixed-rig eval"]);
    expect(bulletCount(note)).toBe(3);
    expect(note.subBullets).toEqual([]);
  });

  it("FIG 주석을 파싱한다", () => {
    const note = parseNote(`## @August 1, 2026\n\n### T\n- b\n\n<!-- FIG: /tmp/x.png | 캡션 텍스트 -->\n`);
    expect(note.figs).toHaveLength(1);
    expect(note.figs[0]?.path).toBe("/tmp/x.png");
    expect(note.figs[0]?.caption).toBe("캡션 텍스트");
  });
});

describe("lintNote", () => {
  it("정상 노트는 통과한다", () => {
    const r = lintNote(GOOD, { expectedDate: "2026-08-21" });
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("H1: 헤딩 0개는 오류", () => {
    const r = lintNote("### T\n- b\n");
    expect(r.issues.some((i) => i.code === "H1")).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("H3: 파일 날짜와 헤딩 날짜 불일치는 오류", () => {
    const r = lintNote(GOOD, { expectedDate: "2026-08-22" });
    expect(r.issues.some((i) => i.code === "H3")).toBe(true);
  });

  it("B1: 110자 초과 불릿은 오류", () => {
    const long = "가".repeat(111);
    const r = lintNote(`## @August 21, 2026\n\n### T\n- ${long}\n`);
    expect(r.issues.some((i) => i.code === "B1")).toBe(true);
  });

  it("B3: 하위 불릿은 오류", () => {
    const r = lintNote(`## @August 21, 2026\n\n### T\n- 상위\n  - 하위\n`);
    expect(r.issues.some((i) => i.code === "B3")).toBe(true);
  });

  it("M1: 메타서술은 오류", () => {
    const r = lintNote(`## @August 21, 2026\n\n### T\n- Claude에게 리팩토링을 시켰다\n`);
    expect(r.issues.some((i) => i.code === "M1")).toBe(true);
  });

  it("E1: 빈 노트는 오류", () => {
    const r = lintNote(`## @August 21, 2026\n`);
    expect(r.issues.some((i) => i.code === "E1")).toBe(true);
  });

  it("F1: 없는 FIG 파일은 오류 (checkFigFiles)", () => {
    const r = lintNote(`## @August 21, 2026\n\n### T\n- b\n\n<!-- FIG: /no/such/file.png | c -->\n`, {
      checkFigFiles: true,
    });
    expect(r.issues.some((i) => i.code === "F1")).toBe(true);
  });

  it("T1/B2: 주제·불릿 초과는 경고(warn)이고 ok는 유지", () => {
    const topics = Array.from({ length: 5 }, (_, i) => `### T${i}\n- b${i}`).join("\n\n");
    const r = lintNote(`## @August 21, 2026\n\n${topics}\n`);
    expect(r.issues.some((i) => i.code === "T1" && i.severity === "warn")).toBe(true);
    expect(r.ok).toBe(true);
  });
});
