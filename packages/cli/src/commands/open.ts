import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { loadConfig } from "../lib/config.js";
import { expandTilde, contractTilde } from "../lib/paths.js";
import { t } from "../lib/i18n.js";
import { die, ok } from "../lib/ui.js";

export function openCommand(): void {
  const cfg = loadConfig();
  const dir = expandTilde(cfg.notesDir);
  if (!fs.existsSync(dir)) {
    die(t("노트 폴더가 아직 없습니다 ({dir})", { dir: contractTilde(dir) }), t("oln today  로 첫 노트를 작성하세요"));
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawnSync(opener, [dir], { stdio: "ignore" });
  ok(t("노트 폴더를 열었습니다: {dir}", { dir: contractTilde(dir) }));
}
