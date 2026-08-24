import { spawn, spawnSync } from "node:child_process";
import { t } from "./i18n.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SSH_OPTS = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8"];

export interface SshResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** ssh 자체 연결 실패 (인증·네트워크) */
  connectionFailed: boolean;
}

/** 비동기 ssh 실행 — 스피너가 멈추지 않도록 이벤트 루프를 막지 않는다 */
export function sshRunAsync(host: string, remoteCommand: string, timeoutMs = 30_000): Promise<SshResult> {
  return new Promise((resolve) => {
    const child = spawn("ssh", [...SSH_OPTS, host, remoteCommand], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (status: number, err = false): void => {
      if (done) return;
      done = true;
      resolve({ ok: status === 0 && !err, stdout, stderr, connectionFailed: status === 255 || err });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(-1, true);
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code ?? -1);
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(-1, true);
    });
  });
}

/** 비동기 ssh 실행 — stdout을 Buffer로 수집 (tar 등 바이너리 스트림용) */
export function sshRunBufferAsync(
  host: string,
  remoteCommand: string,
  timeoutMs = 120_000,
): Promise<{ status: number; stdout: Buffer; connectionFailed: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("ssh", [...SSH_OPTS, host, remoteCommand], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (status: number, err = false): void => {
      if (done) return;
      done = true;
      resolve({ status, stdout: Buffer.concat(chunks), connectionFailed: status === 255 || err });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(-1, true);
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code ?? -1);
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(-1, true);
    });
  });
}

/** 비동기 연결 테스트 */
export async function sshTestAsync(host: string): Promise<{ ok: boolean; detail: string }> {
  const r = await sshRunAsync(host, "true", 12_000);
  if (r.ok) return { ok: true, detail: t("연결됨") };
  const msg = r.stderr.trim().split("\n")[0] ?? "";
  return { ok: false, detail: msg.slice(0, 120) || t("연결 실패") };
}

const homeCache = new Map<string, string | null>();
const downHosts = new Set<string>();

/** 이번 실행에서 연결 불가로 판정된 호스트 — 반복 타임아웃을 피한다 */
export function markHostDown(host: string): void {
  downHosts.add(host);
}
export function isHostDown(host: string): boolean {
  return downHosts.has(host);
}

/** 원격 $HOME 해석 (런당 캐시, 비동기). 실패 시 null */
export async function remoteHome(host: string): Promise<string | null> {
  if (homeCache.has(host)) return homeCache.get(host) ?? null;
  const r = await sshRunAsync(host, 'printf %s "$HOME"', 15_000);
  const home = r.ok && r.stdout.trim().startsWith("/") ? r.stdout.trim() : null;
  homeCache.set(host, home);
  return home;
}

/** 테스트·재실행 대비 캐시 초기화 */
export function clearRemoteCache(): void {
  homeCache.clear();
  downHosts.clear();
}

/** 원격 경로의 ~ 를 원격 $HOME 으로 확장 (비동기) */
export async function expandRemoteTilde(host: string, p: string): Promise<string | null> {
  if (p === "~" || p.startsWith("~/")) {
    const home = await remoteHome(host);
    if (!home) return null;
    return p === "~" ? home : home + p.slice(1);
  }
  return p;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * 원격 디렉토리에서 기간 내 수정된 *.jsonl 만 tar로 당겨 로컬 임시 디렉토리에 푼다.
 * @returns 로컬 디렉토리 경로 (원격 디렉토리 없음/파일 없음이면 null), 실패 시 warning 추가
 */
export async function fetchRemoteJsonl(
  host: string,
  remoteDir: string,
  sinceYmd: string,
  warnings: string[],
): Promise<string | null> {
  if (isHostDown(host)) return null; // 프리플라이트에서 이미 안내됨
  const expanded = await expandRemoteTilde(host, remoteDir);
  if (!expanded) {
    warnings.push(t("{host}: 원격 $HOME 확인 실패 — 연결·키 인증을 확인하세요 (ssh {host})", { host }));
    return null;
  }
  const remoteCmd =
    `cd ${shellQuote(expanded)} 2>/dev/null && ` +
    `find . -name '*.jsonl' -newermt ${shellQuote(sinceYmd)} -print0 | tar -czf - --null -T -`;

  const res = await sshRunBufferAsync(host, remoteCmd, 120_000);
  const status = res.status;
  if (res.connectionFailed) {
    warnings.push(t("{host}: SSH 연결 실패 — ssh {host} 로 키 인증을 확인하세요", { host }));
    return null;
  }
  const out = res.stdout;
  if (status !== 0 || out.length === 0) return null; // 디렉토리 없음 or 기간 내 파일 없음

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `oln-remote-${host.replace(/[^A-Za-z0-9]/g, "_")}-`));
  const tarFile = path.join(tmp, "fetch.tgz");
  fs.writeFileSync(tarFile, out);
  const ex = spawnSync("tar", ["-xzf", tarFile, "-C", tmp], { encoding: "utf8", timeout: 60_000 });
  fs.unlinkSync(tarFile);
  if (ex.status !== 0) {
    warnings.push(t("{host}: 원격 세션 아카이브 해제 실패 ({err})", { host, err: (ex.stderr || "").trim().slice(0, 80) }));
    fs.rmSync(tmp, { recursive: true, force: true });
    return null;
  }
  return tmp;
}

/** 원격 git log 실행 — 로컬 collectGit과 동일한 출력 형식 */
export async function remoteGitLog(
  host: string,
  repoPath: string,
  args: { sinceFlag: string; since: string; untilExclusive: string; sep: string },
): Promise<{ ok: boolean; stdout: string; stderr: string; connectionFailed: boolean }> {
  const expanded = await expandRemoteTilde(host, repoPath);
  if (!expanded) return { ok: false, stdout: "", stderr: t("{host}: 원격 $HOME 확인 실패 — ssh {host} 로 키 인증을 확인하세요", { host }), connectionFailed: true };
  const cmd =
    `git -C ${shellQuote(expanded)} log --no-merges ` +
    `${shellQuote(`${args.sinceFlag}=${args.since} 00:00:00`)} ` +
    `${shellQuote(`--until=${args.untilExclusive} 00:00:00`)} ` +
    `${shellQuote(`--pretty=format:${args.sep}%h|%aI|%an|%s`)} --numstat`;
  const r = await sshRunAsync(host, cmd, 60_000);
  return { ok: r.ok, stdout: r.stdout, stderr: r.stderr, connectionFailed: r.connectionFailed };
}
