import https from "node:https";
import { loadAppState, saveAppState } from "./app-state.js";
import type { Config } from "./config.js";
import { t } from "./i18n.js";

const CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** "x.y.z" 숫자 비교 — 코어 버전만 (프리릴리스 접미사는 무시: "0.2.0-beta" == "0.2.0"). a가 크면 1, 작으면 -1 */
export function compareVersions(a: string, b: string): number {
  const core = (s: string): number[] => (s.split("-")[0] ?? "").split(".").map((x) => parseInt(x, 10) || 0);
  const pa = core(a);
  const pb = core(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * 주 1회 npm registry에서 최신 버전 번호만 조회한다 (전송되는 것은 패키지 이름뿐 — docs/versioning.md §6).
 * 비차단: 소켓을 unref해 프로세스 종료를 막지 않고, 결과는 다음 홈 렌더에 반영된다.
 * 끄기: 설정 update-check 또는 OLN_NO_UPDATE_CHECK=1.
 */
export function maybeCheckForUpdates(cfg: Config): void {
  if (!cfg.updateCheck || process.env.OLN_NO_UPDATE_CHECK) return;
  const st = loadAppState();
  if (st.updateCheckedAt) {
    const elapsed = Date.now() - Date.parse(st.updateCheckedAt);
    // 미래 시각(시계 이동·백업 복원)이나 파싱 실패는 무시하고 다시 확인한다
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < CHECK_INTERVAL_MS) return;
  }
  saveAppState({ updateCheckedAt: new Date().toISOString() });
  const req = https.get(
    "https://registry.npmjs.org/-/package/openlabnote/dist-tags",
    { headers: { accept: "application/json" }, timeout: 4000 },
    (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => {
        if (body.length < 4096) body += c;
      });
      res.on("end", () => {
        try {
          const latest = (JSON.parse(body) as { latest?: string }).latest;
          if (typeof latest === "string" && /^\d+\.\d+\.\d+/.test(latest)) {
            saveAppState({ latestKnownVersion: latest });
          }
        } catch {
          /* 무시 — 다음 주에 다시 */
        }
      });
    },
  );
  req.on("timeout", () => req.destroy());
  req.on("error", () => {});
  req.on("socket", (s) => s.unref());
}

/** 새 버전이 알려져 있으면 홈에 띄울 한 줄 (없으면 null) */
export function updateNoticeLine(currentVersion: string): string | null {
  const { latestKnownVersion } = loadAppState();
  if (!latestKnownVersion || compareVersions(latestKnownVersion, currentVersion) <= 0) return null;
  return t("새 버전 {v}가 나왔습니다 (지금 {cur}) — 업데이트:  npm i -g openlabnote@latest", {
    v: latestKnownVersion,
    cur: currentVersion,
  });
}
