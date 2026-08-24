import { spawnSync } from "node:child_process";

/**
 * $VISUAL/$EDITOR로 파일 열기 (공백 인자 지원 — 예: EDITOR="code -w").
 * 편집기 실행 실패 시 OS 기본 열기로 폴백. 최종 성공 여부를 반환한다.
 */
export function openFileForEdit(fp: string): boolean {
  const editor = process.env.VISUAL || process.env.EDITOR;
  if (editor) {
    const [cmd, ...args] = editor.split(/\s+/).filter(Boolean);
    if (cmd) {
      const r = spawnSync(cmd, [...args, fp], { stdio: "inherit" });
      if (!r.error) return true;
    }
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const r = spawnSync(opener, [fp], { stdio: "ignore" });
  return !r.error && (r.status ?? 1) === 0;
}
