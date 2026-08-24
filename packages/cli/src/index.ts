#!/usr/bin/env node
import { Command } from "commander";
import { captureCommand, type CaptureOptions } from "./commands/capture.js";
import { catchupCommand } from "./commands/catchup.js";
import { collectCommand } from "./commands/collect.js";
import { homeCommand } from "./commands/home.js";
import { initCommand } from "./commands/init.js";
import { lintCommand } from "./commands/lint.js";
import { configCommand, instructionsCommand } from "./commands/meta.js";
import { exportCommand } from "./commands/export.js";
import { resetCommand } from "./commands/reset.js";
import { noteCommand } from "./commands/note.js";
import { openCommand } from "./commands/open.js";
import { setupCommand } from "./commands/setup.js";
import { statusCommand } from "./commands/status.js";
import { uiCommand } from "./commands/ui.js";
import { todayCommand } from "./commands/today.js";
import { ensureFirstRunVersion } from "./lib/app-state.js";
import { configExists, ensureOlnHome, loadConfig } from "./lib/config.js";
import { detectSystemLocale, setLocale } from "./lib/i18n.js";
import { die } from "./lib/ui.js";
import { CLI_VERSION } from "./lib/version.js";

const program = new Command();

program
  .name("oln")
  .description("openlabnote — 개발 기록(Claude Code·Codex·git)을 일자별 연구노트로")
  .version(CLI_VERSION)
  .action(async () => run(homeCommand));

program
  .command("init")
  .description("초기 설정 인터뷰 (스캔 → 질문)")
  .option("--force", "기존 설정 무시하고 처음부터")
  .action(async (opts: { force?: boolean }) => run(() => initCommand(opts)));

program
  .command("today")
  .description("오늘 일 정리 — 수집→작성→검사→저장")
  .option("--date <YYYY-MM-DD>", "다른 날짜를 오늘처럼 처리")
  .option("--force", "기존 노트가 있어도 다시 작성 (.bak 보관)")
  .action(async (opts: { date?: string; force?: boolean }) => run(() => todayCommand(opts)));

program
  .command("capture [text...]")
  .description("순간 기록 — 지금 이 내용을 그날 노트에 반드시 반영하도록 남긴다 (여러 줄은 파이프)")
  .option("-p, --project <id>", "과제 지정 (기본: 현재 폴더로 자동 판별)")
  .option("--date <YYYY-MM-DD>", "다른 날짜로 기록 (기본: 오늘)")
  .action(async (words: string[], opts: CaptureOptions) => run(() => captureCommand(words, opts)));

program
  .command("catchup")
  .description("밀린 날짜 정리 — 기록은 있는데 노트가 없는 날짜 채우기 (기본 최근 14일)")
  .option("--since <YYYY-MM-DD>", "시작 날짜")
  .option("--until <YYYY-MM-DD>", "끝 날짜")
  .option("-y, --yes", "확인 없이 진행")
  .action(async (opts: { since?: string; until?: string; yes?: boolean }) => run(() => catchupCommand(opts)));

program
  .command("status")
  .description("현황 — 히트맵과 과제별 상태")
  .option("--json", "JSON 출력")
  .action(async (opts: { json?: boolean }) => run(() => statusCommand(opts)));

program
  .command("note <date>")
  .description("특정 날짜 노트 보기·편집·재작성 (date: YYYY-MM-DD 또는 today)")
  .option("--project <id>", "특정 과제만")
  .option("--edit", "에디터로 열기")
  .option("--regen", "다시 작성 (기존은 .bak)")
  .action(async (date: string, opts: { project?: string; edit?: boolean; regen?: boolean }) =>
    run(() => noteCommand(date, opts)),
  );

program.command("open").description("노트 폴더 열기").action(async () => run(async () => openCommand()));

program
  .command("ui")
  .description("웹 뷰어 — 노트를 브라우저에서 열람 (읽기 전용, 127.0.0.1)")
  .option("--port <n>", "포트 (기본 4870)")
  .option("--no-open", "브라우저 자동 열기 끄기")
  .action(async (opts: { port?: string; open?: boolean }) => {
    await run(() => uiCommand(opts));
    await new Promise(() => {}); // 서버 유지 (Ctrl+C로 종료)
  });

program
  .command("export")
  .description("제출용 산출물 내보내기 — 일자별 PNG (+--pdf 기간 PDF), <notesDir>/<과제>/.out/")
  .option("--project <id>", "특정 과제만")
  .option("--since <YYYY-MM-DD>", "시작 날짜 (기본: 최근 30일)")
  .option("--until <YYYY-MM-DD>", "끝 날짜 (기본: 오늘)")
  .option("--pdf", "기간 통합 PDF도 생성")
  .option("--no-png", "PNG 생략")
  .option("--open", "완료 후 산출물 폴더 열기")
  .option("--allow-secrets", "시크릿 스캔 차단을 이번 실행에 한해 해제")
  .action(async (opts: { project?: string; since?: string; until?: string; pdf?: boolean; png?: boolean; open?: boolean; allowSecrets?: boolean }) =>
    run(() => exportCommand(opts)),
  );

program
  .command("setup [section]")
  .description("설정 변경 (projects | remotes | notes-dir | language | engine | author | sources | ui-language | update-check)")
  .action(async (section?: string) => run(() => setupCommand(section)));

program
  .command("collect")
  .description("[저수준] 기록 수집만 실행 — raw 덤프 생성 (스킬·스크립트용)")
  .option("--since <YYYY-MM-DD>", "시작 날짜 (기본: 오늘)")
  .option("--until <YYYY-MM-DD>", "끝 날짜 (기본: 오늘)")
  .option("--json", "JSON 출력")
  .action(async (opts: { since?: string; until?: string; json?: boolean }) => run(() => collectCommand(opts)));

program
  .command("lint")
  .description("[저수준] 노트 포맷 검사")
  .option("--project <id>", "특정 과제만")
  .option("--date <YYYY-MM-DD>", "특정 날짜만")
  .option("--json", "JSON 출력")
  .action(async (opts: { project?: string; date?: string; json?: boolean }) => run(async () => lintCommand(opts)));

program
  .command("instructions <name>")
  .description("작성 지침 보기·수정 (write | polish | concise) — 내 지침으로 바꾸면 이후 작성에 반영")
  .option("--edit", "내 지침 사본을 만들어 에디터로 열기 (~/.openlabnote/instructions/)")
  .option("--reset", "내 지침을 지우고 기본으로 복귀")
  .action(async (name: string, opts: { edit?: boolean; reset?: boolean }) =>
    run(async () => instructionsCommand(name, opts)),
  );

program
  .command("reset")
  .description("처음 상태로 초기화 — 설정·raw 삭제 (--notes: 노트 폴더까지)")
  .option("--notes", "노트 폴더(정본 md)까지 삭제")
  .option("-y, --yes", "확인 없이 진행")
  .action(async (opts: { notes?: boolean; yes?: boolean }) => run(() => resetCommand(opts)));

program
  .command("config")
  .description("[저수준] 해석된 설정을 JSON으로 출력")
  .action(async () => run(async () => configCommand()));

async function run(fn: () => Promise<void> | void): Promise<void> {
  try {
    ensureOlnHome();
    ensureFirstRunVersion(CLI_VERSION); // 신규 설치의 새 소식 기준점
    // 로케일 부트스트랩: 설정이 있으면 uiLanguage(loadConfig가 setLocale), 없으면 시스템 추정
    setLocale(detectSystemLocale());
    if (configExists()) {
      try {
        loadConfig();
      } catch {
        /* 손상된 설정은 각 명령에서 안내 */
      }
    }
    await fn();
    // 감시 리스너가 정상 완료 후 종료를 막지 않게 (stdio=ignore인 자식엔 unref가 없다)
    (process.stdin as unknown as { unref?: () => void }).unref?.();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (process.env.OLN_DEBUG && e instanceof Error && e.stack) console.error(e.stack);
    const frame =
      e instanceof Error
        ? e.stack
            ?.split("\n")
            .slice(1)
            .find((l) => l.includes("/dist/") || l.includes("/src/"))
            ?.trim()
        : undefined;
    die(frame ? `${msg}\n   ${frame}` : msg, "OLN_DEBUG=1 oln …  — 전체 스택 출력");
  }
}

// 최후 안전장치: raw 모드에서는 Ctrl+C가 SIGINT가 아니라 바이트(0x03)로 전달되므로,
// 입력 처리 계층에 버그가 있으면 사용자가 갇힌다. 최하층에서 0x03을 감시해
// 1.5초 내 두 번 누르면 무조건 강제 종료한다 (한 번은 각 프롬프트의 정상 취소에 양보).
if (process.stdin.isTTY) {
  let lastSigintAt = 0;
  process.stdin.on("data", (b: Buffer) => {
    if (!b.includes(0x03)) return;
    const now = Date.now();
    if (now - lastSigintAt < 1500) {
      process.stdout.write("\x1b[?25h\n"); // 커서 복구
      try {
        process.stdin.setRawMode?.(false);
      } catch {
        /* ignore */
      }
      process.exit(130);
    }
    lastSigintAt = now;
  });
  // 주의: 여기서 unref하면 프롬프트만 대기 중인 명령이 조용히 죽는다.
  // 명령 완료 후 run()의 finally에서 unref해 자연 종료를 허용한다.
}

// top-level await를 쓰지 않는다 — 명령 흐름 중 process.exit(정상 종료·die 등)가 호출되면
// Node가 "unsettled top-level await" 경고를 내기 때문. 일반 promise 체인이면 무경고.
program.parseAsync(process.argv).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
