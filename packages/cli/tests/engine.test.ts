import { describe, expect, it } from "vitest";
import { buildWritePrompt, cleanupEngineOutput } from "../src/compose/engine.js";
import { ConfigSchema } from "../src/lib/config.js";

const cfg = ConfigSchema.parse({
  version: 1,
  author: { name: "T", gitAuthors: ["t"] },
  notesDir: "/tmp/notes",
  language: "mixed",
  engine: "claude",
  sources: {},
  projects: [{ id: "p", title: "과제 P", repos: [], dirs: [] }],
});

describe("buildWritePrompt", () => {
  it("플레이스홀더를 모두 치환한다", () => {
    const prompt = buildWritePrompt(cfg, cfg.projects[0]!, "2026-08-21", "RAW BODY");
    expect(prompt).toContain("@August 21, 2026");
    expect(prompt).toContain("과제 P");
    expect(prompt).toContain("RAW BODY");
    expect(prompt).not.toContain("{{");
  });
});

describe("cleanupEngineOutput", () => {
  const note = "## @August 21, 2026\n\n### T\n- b";

  it("코드펜스 래핑을 벗긴다", () => {
    expect(cleanupEngineOutput("```markdown\n" + note + "\n```")).toBe(note + "\n");
  });

  it("헤딩 앞 잡담을 제거한다", () => {
    expect(cleanupEngineOutput("네, 작성했습니다.\n\n" + note)).toBe(note + "\n");
  });

  it("정상 출력은 그대로 둔다", () => {
    expect(cleanupEngineOutput(note)).toBe(note + "\n");
  });
});
