import pc from "picocolors";
import { t } from "./i18n.js";

/** 색상 사용 여부 (NO_COLOR·비TTY 자동 감지는 picocolors가 처리) */
export const symbols = {
  ok: pc.green("✓"),
  fail: pc.red("✗"),
  warn: pc.yellow("!"),
  bullet: pc.dim("·"),
};

export function heading(text: string): string {
  return pc.bold(`◆ ${text}`);
}

export function dim(text: string): string {
  return pc.dim(text);
}

export function bold(text: string): string {
  return pc.bold(text);
}

export function step(n: string, label: string, detail = ""): void {
  console.log(`${pc.cyan(n)} ${pc.bold(label)}${detail ? "  " + detail : ""}`);
}

export function ok(msg: string): void {
  console.log(`  ${symbols.ok} ${msg}`);
}

export function fail(msg: string): void {
  console.log(`  ${symbols.fail} ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${msg}`);
}

/** 모든 명령의 마지막 줄 — "다음에 할 일" */
export function nextLine(...suggestions: string[]): void {
  if (suggestions.length === 0) return;
  console.log("");
  console.log(pc.dim(t("다음에 할 일:  ")) + suggestions.map((s) => pc.cyan(s)).join(pc.dim("  ·  ")));
}

/** 원인 + 해결 명령 한 쌍으로 에러 출력 후 종료 */
export function die(cause: string, fix?: string): never {
  console.error(`${symbols.fail} ${cause}`);
  if (fix) console.error(pc.dim(t("해결: ")) + pc.cyan(fix));
  process.exit(1);
}

export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY && !process.env.CI);
}

/** 간단한 터미널 md 미리보기 (헤딩·불릿 강조) */
export function renderMarkdown(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) return pc.bold(pc.underline(line.slice(3)));
      if (line.startsWith("### ")) return pc.bold(pc.cyan(line.slice(4)));
      if (line.startsWith("- ")) return pc.dim("• ") + line.slice(2);
      if (line.startsWith("<!-- FIG:")) {
        return pc.dim(
          line.replace(/<!-- FIG: (.*?) \| (.*?) -->/, (_, p: string, c: string) =>
            t("[그림] {caption} ({path})", { caption: c, path: p }),
          ),
        );
      }
      return line;
    })
    .join("\n");
}
