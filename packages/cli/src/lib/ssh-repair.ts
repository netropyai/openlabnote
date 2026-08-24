import * as clack from "@clack/prompts";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isRemoteEntry, type Config } from "./config.js";
import { t } from "./i18n.js";
import { isHostDown, markHostDown, sshTestAsync } from "./remote.js";
import { isInteractive } from "./ui.js";

/** 비밀번호 1회로 공개키를 심는다 (없으면 키 생성부터). 성공 여부 반환 */
export async function installSshKey(host: string): Promise<boolean> {
  const sshDir = path.join(os.homedir(), ".ssh");
  const hasKey = ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"].some((f) =>
    fs.existsSync(path.join(sshDir, f)),
  );
  if (!hasKey) {
    const gen = await clack.confirm({
      message: t("SSH 키가 없습니다. 새로 만들까요? (ed25519, 암호 없음)"),
      initialValue: true,
    });
    if (clack.isCancel(gen) || !gen) return false;
    const kg = spawnSync(
      "ssh-keygen",
      ["-q", "-t", "ed25519", "-N", "", "-f", path.join(sshDir, "id_ed25519")],
      { stdio: "inherit" },
    );
    if (kg.status !== 0) {
      clack.log.warn(t("키 생성에 실패했습니다"));
      return false;
    }
  }
  clack.log.info(
    t("{host}의 비밀번호를 물으면 입력하세요 — 이 1회뿐이고, 이후엔 키로 자동 접속합니다.", { host }),
  );
  if (process.stdin.isTTY) process.stdin.setRawMode?.(false); // ssh 비밀번호 입력을 위해 raw 해제
  const r = spawnSync("ssh-copy-id", [host], { stdio: "inherit" });
  if (r.error) {
    clack.log.warn(t("ssh-copy-id를 실행할 수 없습니다 — 수동으로:  ssh-copy-id {host}", { host }));
    return false;
  }
  return r.status === 0;
}

/** 설정에서 실제로 쓰이는 원격 호스트 전부 (remotes + 과제의 "호스트:" 항목) */
function usedHosts(cfg: Config): string[] {
  const hosts = new Set<string>(cfg.remotes.map((r) => r.host));
  for (const p of cfg.projects)
    for (const repo of p.repos)
      if (isRemoteEntry(repo)) hosts.add(repo.slice(0, repo.indexOf(":")));
  return [...hosts];
}

/**
 * 수집 전 원격 연결 점검. 끊긴 호스트는:
 * - 대화형이면 그 자리에서 "비밀번호 1회 → 키 재등록 → 재시도"를 제안하고,
 * - 아니면(또는 거절·실패 시) 이번 실행에서 건너뛰도록 표시한 뒤 경고 한 줄을 남긴다.
 * 부수 효과: 죽은 호스트에 대한 반복 ssh 타임아웃(세션×2 + 리포별 git)을 없앤다.
 */
export async function preflightRemotes(
  cfg: Config,
  warnings: string[],
  opts: { repair: boolean },
): Promise<void> {
  for (const host of usedHosts(cfg)) {
    if (isHostDown(host)) continue;
    const test = await sshTestAsync(host);
    if (test.ok) continue;

    if (opts.repair && isInteractive()) {
      const go = await clack.confirm({
        message: t("{host} 연결이 끊겼습니다. 지금 비밀번호를 입력해 다시 연결할까요? (키 재등록 — 1회 입력)", { host }),
        initialValue: true,
      });
      if (!clack.isCancel(go) && go) {
        const ok = (await installSshKey(host)) && (await sshTestAsync(host)).ok;
        if (ok) {
          clack.log.success(t("{host}: 다시 연결됐습니다", { host }));
          continue;
        }
        clack.log.warn(t("{host}: 재연결에 실패했습니다", { host }));
      }
    }
    markHostDown(host);
    warnings.push(
      t("{host}: 연결할 수 없어 이번 수집에서 건너뜁니다 (다시 연결: ssh-copy-id {host})", { host }),
    );
  }
}
