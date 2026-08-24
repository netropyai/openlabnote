import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { t } from "./i18n.js";
import { olnHome } from "./paths.js";
import { ok } from "./ui.js";
import { CLI_VERSION } from "./version.js";

export const UI_PORT = 4870;
const PORT_SCAN = 10; // 4870~4879

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    const done = (v: boolean): void => {
      sock.destroy();
      resolve(v);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    setTimeout(() => done(false), 400);
  });
}

interface UiMeta {
  app?: string;
  pid?: number;
  olnHome?: string;
  version?: string;
}

/** 해당 포트의 서버가 oln 웹 뷰어인지 신원 확인 (아니거나 응답 없으면 null) */
function fetchMeta(port: number): Promise<UiMeta | null> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/meta", timeout: 700 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => {
        if (body.length < 4096) body += c;
      });
      res.on("end", () => {
        try {
          const meta = JSON.parse(body) as UiMeta;
          resolve(meta.app === "openlabnote-ui" ? meta : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

async function waitPort(port: number, inUse: boolean, tries = 15): Promise<void> {
  for (let i = 0; i < tries && (await portInUse(port)) !== inUse; i++) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

/**
 * 웹 뷰어가 서빙할 포트를 정한다:
 * - 빈 포트 → 그대로 사용 (새로 띄움)
 * - 우리 서버 + 같은 설정 홈 + 같은 버전 → 재사용
 * - 우리 서버지만 낡음(다른 버전·다른 OLN_HOME, 옛 프로세스) → 종료시키고 그 포트 재사용
 * - 남의 프로세스 → 다음 포트로
 */
export async function resolveUiPort(): Promise<{ port: number; running: boolean }> {
  for (let port = UI_PORT; port < UI_PORT + PORT_SCAN; port++) {
    if (!(await portInUse(port))) return { port, running: false };
    const meta = await fetchMeta(port);
    if (!meta) continue; // 남의 프로세스 (또는 /api/meta 없는 아주 옛 서버) — 건드리지 않는다
    if (meta.olnHome === olnHome() && meta.version === CLI_VERSION) return { port, running: true };
    if (meta.pid) {
      try {
        process.kill(meta.pid); // 낡은 우리 서버 — 옛 설정을 계속 서빙하지 않게 교체
      } catch {
        /* 이미 죽었거나 권한 없음 */
      }
      await waitPort(port, false);
      if (!(await portInUse(port))) return { port, running: false };
    }
  }
  return { port: UI_PORT + PORT_SCAN, running: false }; // 최후 폴백 (4880)
}

/**
 * 웹 뷰어를 백그라운드 프로세스로 유지하고 브라우저만 연다.
 * target을 주면 해당 노트로 바로 이동(#p=…&d=…).
 */
export async function launchUiBackground(target?: { projectId: string; date: string }): Promise<void> {
  const { port, running } = await resolveUiPort();
  if (!running) {
    const child = spawn(process.execPath, [process.argv[1] ?? "", "ui", "--no-open", "--port", String(port)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    await waitPort(port, true);
  }
  const hash = target ? `#p=${encodeURIComponent(target.projectId)}&d=${target.date}` : "";
  const url = `http://127.0.0.1:${port}/${hash}`;
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
  ok(t("웹 뷰어를 열었습니다: {url}", { url }));
}
