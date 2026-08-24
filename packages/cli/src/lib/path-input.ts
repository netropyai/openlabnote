import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import pc from "picocolors";
import { t } from "./i18n.js";
import { contractTilde, expandTilde } from "./paths.js";
import { listSshHosts } from "./scan.js";

export const PATH_INPUT_CANCEL: unique symbol = Symbol("cancel");

/* ── 원격 경로 자동완성 ───────────────────────────────────
 * "호스트:~/경로" 입력에서 Tab을 누르면 ssh로 원격 디렉토리 목록을 받아 완성한다.
 * - 디렉토리별 결과를 런 단위로 캐시 (같은 위치에서 여러 번 Tab = 1회 조회)
 * - 5초 타임아웃, 실패도 캐시해 죽은 호스트에 반복 시도하지 않음
 * - 원격 셸에 넘기는 경로는 안전한 문자만 허용 (자기 자신에 대한 명령이지만 방어적으로)
 */
const remoteListCache = new Map<string, string[]>();
const SAFE_REMOTE_DIR = /^[A-Za-z0-9_.\/~@-]*$/;

function listRemoteDirs(host: string, dirPart: string, cb: (names: string[]) => void): void {
  const key = `${host}|${dirPart}`;
  const cached = remoteListCache.get(key);
  if (cached) {
    cb(cached);
    return;
  }
  if (!SAFE_REMOTE_DIR.test(dirPart)) {
    cb([]);
    return;
  }
  const target = dirPart === "" ? "~" : dirPart;
  // ~ 확장을 위해 경로는 따옴표 없이 전달 (SAFE_REMOTE_DIR 통과분만)
  const child = spawn(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=4", host, `cd -- ${target} 2>/dev/null && ls -1Ap`],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  let out = "";
  let done = false;
  const finish = (names: string[]): void => {
    if (done) return;
    done = true;
    remoteListCache.set(key, names);
    cb(names);
  };
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    finish([]);
  }, 5_000);
  child.stdout.on("data", (d: Buffer) => (out += d.toString()));
  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      finish([]);
      return;
    }
    const dirs = out
      .split("\n")
      .filter((l) => l.endsWith("/") && !l.startsWith("."))
      .map((l) => l.slice(0, -1));
    finish(dirs);
  });
  child.on("error", () => {
    clearTimeout(timer);
    finish([]);
  });
}

/**
 * 탭 자동완성이 되는 경로 입력.
 * - Tab: 디렉토리 이름 자동완성 (후보가 여럿이면 목록 표시 — readline 기본 동작)
 * - 빈 입력: initial 반환
 * - Ctrl+C / ESC 계열: PATH_INPUT_CANCEL 반환
 */
export function pathInput(message: string, initial?: string): Promise<string | typeof PATH_INPUT_CANCEL> {
  return new Promise((resolve) => {
    console.log(`${pc.cyan("◆")} ${message}${initial ? pc.dim(t("  (엔터 = {v})", { v: contractTilde(initial) })) : ""}`);
    console.log(pc.dim(t("  Tab: 자동완성 (원격 호스트:경로 포함 — 첫 조회 1~2초) · 빈 입력 엔터 = 완료/기본값")));

    // clack 프롬프트가 남긴 raw mode를 해제해야 readline의 Tab 완성이 동작한다
    if (process.stdin.isTTY) process.stdin.setRawMode?.(false);
    process.stdin.resume();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: completePathAsync,
      terminal: true,
    });

    let done = false;
    const finish = (value: string | typeof PATH_INPUT_CANCEL): void => {
      if (done) return;
      done = true;
      rl.close();
      resolve(value);
    };

    rl.on("SIGINT", () => {
      console.log("");
      finish(PATH_INPUT_CANCEL);
    });

    rl.question(pc.cyan("  > "), (answer) => {
      const v = answer.trim();
      if (!v) {
        finish(initial ? initial : PATH_INPUT_CANCEL);
        return;
      }
      // 원격(scp 스타일 "호스트:~/경로") 입력은 로컬 해석 없이 그대로 통과
      if (/^[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?:(?:~|\/)/.test(v)) {
        finish(v);
        return;
      }
      finish(contractTilde(path.resolve(expandTilde(v))));
    });
  });
}

/** 비동기 completer — 원격("호스트:경로")은 ssh 조회, 로컬은 동기 completePath */
function completePathAsync(
  line: string,
  cb: (err: Error | null, result: [string[], string]) => void,
): void {
  const m = /^([A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?):(.*)$/.exec(line);
  if (!m) {
    cb(null, completePath(line));
    return;
  }
  const host = m[1]!;
  const rpath = m[2]!;
  // 경로가 비었거나 ~/, / 로 시작하지 않으면 ~/ 를 제안
  if (rpath === "" || rpath === "~") {
    cb(null, [[`${host}:~/`], line]);
    return;
  }
  const slash = rpath.lastIndexOf("/");
  if (slash < 0) {
    cb(null, [[], line]);
    return;
  }
  const dirPart = rpath.slice(0, slash + 1); // 입력 표기 그대로 (~/ 포함)
  const prefix = rpath.slice(slash + 1);
  listRemoteDirs(host, dirPart, (names) => {
    const candidates = names
      .filter((n) => n.startsWith(prefix))
      .map((n) => `${host}:${dirPart}${n}/`)
      .sort();
    cb(null, [candidates, line]);
  });
}

/**
 * readline completer (로컬 — 동기).
 * - 입력의 `~` 접두를 보존한 채 디렉토리 이름을 완성한다 ("~/Dev" + Tab → "~/Development/")
 * - 슬래시가 없는 입력은 ssh 호스트 별칭도 후보로 제시 ("serv" + Tab → "serverA:")
 * - 원격 경로는 completePathAsync가 처리한다
 */
export function completePath(line: string): [string[], string] {
  try {
    const input = line;
    if (/^[A-Za-z0-9._-]+(?:@[A-Za-z0-9._-]+)?:/.test(input)) return [[], input]; // 원격: async 쪽에서 처리

    // "~" 단독 → "~/" 로
    if (input === "~") return [["~/"], input];

    const slash = input.lastIndexOf("/");
    const candidates: string[] = [];

    if (slash >= 0) {
      const dirPart = input.slice(0, slash + 1); // 입력한 표기 그대로 보존 (~/ 포함)
      const prefix = input.slice(slash + 1);
      const readDir = expandTilde(dirPart === "/" ? "/" : dirPart);
      if (fs.existsSync(readDir)) {
        for (const e of fs.readdirSync(readDir, { withFileTypes: true })) {
          if (!e.isDirectory() || e.name.startsWith(".")) continue;
          if (e.name.startsWith(prefix)) candidates.push(dirPart + e.name + "/");
        }
      }
    } else {
      // 슬래시 없음: ~ 시작, 홈 하위 디렉토리, ssh 호스트를 후보로
      if ("~".startsWith(input) || input === "") candidates.push("~/");
      const home = expandTilde("~");
      for (const e of fs.readdirSync(home, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith(".")) continue;
        if (input && e.name.startsWith(input)) candidates.push(e.name + "/");
      }
      for (const h of listSshHosts()) {
        if (input && h.startsWith(input)) candidates.push(h + ":");
      }
    }
    return [candidates.sort(), input];
  } catch {
    return [[], line];
  }
}
