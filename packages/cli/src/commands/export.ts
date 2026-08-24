import * as clack from "@clack/prompts";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, type Config } from "../lib/config.js";
import { addDays, isYmd, todayYmd } from "../lib/dates.js";
import { t } from "../lib/i18n.js";
import { contractTilde, expandTilde } from "../lib/paths.js";
import { renderPdf, renderPngs, RenderError, type RenderItem } from "../render/render.js";
import { scanSecrets } from "../lib/redact.js";
import { die, fail, info, nextLine, ok } from "../lib/ui.js";

export interface ExportOptions {
  project?: string;
  since?: string;
  until?: string;
  pdf?: boolean;
  png?: boolean;
  open?: boolean;
  /** 시크릿 스캔 차단을 이번 실행에 한해 해제 (의도된 값임을 확인했을 때만) */
  allowSecrets?: boolean;
}

const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * 제출용 산출물 내보내기 — 일자별 PNG(어떤 서비스든 업로드 가능) + 선택적 기간 PDF.
 * 산출물은 <notesDir>/<project>/.out/ 에 생성되는 파생물이며 md가 정본이다.
 */
export async function exportCommand(opts: ExportOptions): Promise<void> {
  const cfg = loadConfig();
  const until = opts.until ?? todayYmd();
  const since = opts.since ?? addDays(until, -(DEFAULT_LOOKBACK_DAYS - 1));
  if (!isYmd(since) || !isYmd(until) || since > until)
    die(t("날짜 범위가 잘못됐습니다"), "oln export --since 2026-08-01 --until 2026-08-21");

  const projects = opts.project ? cfg.projects.filter((p) => p.id === opts.project) : cfg.projects;
  if (projects.length === 0) die(t("과제를 찾을 수 없습니다: {p}", { p: opts.project ?? "" }), t("oln setup projects  에서 과제 id 확인"));

  // 시크릿 스캔 게이트 — 외부 제출물이 되는 시점이므로 발견 시 차단한다
  if (!opts.allowSecrets) {
    let secretCount = 0;
    for (const project of projects) {
      const dir = path.join(expandTilde(cfg.notesDir), project.id);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir).sort()) {
        const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(name);
        if (!m || !m[1] || m[1] < since || m[1] > until) continue;
        const fp = path.join(dir, name);
        const findings = scanSecrets(fs.readFileSync(fp, "utf8"));
        if (findings.length === 0) continue;
        if (secretCount === 0) fail(t("시크릿으로 의심되는 값이 노트에 있습니다 — 내보내기를 중단합니다"));
        info(`  ${contractTilde(fp)}`);
        for (const f of findings) {
          info(t("    L{line}  {label}: {masked}", { line: f.line, label: t(f.label), masked: f.masked }));
          secretCount += 1;
        }
      }
    }
    if (secretCount > 0) {
      die(
        t("총 {n}건 발견. 노트를 수정한 뒤 다시 실행하세요.", { n: secretCount }),
        t("실제 키가 아니라 의도한 값이면:  oln export --allow-secrets"),
      );
    }
  }

  let totalPng = 0;
  let totalPdf = 0;
  const outDirs: string[] = [];

  try {
    for (const project of projects) {
      const dir = path.join(expandTilde(cfg.notesDir), project.id);
      if (!fs.existsSync(dir)) continue;
      const dates = fs
        .readdirSync(dir)
        .map((f) => /^(\d{4}-\d{2}-\d{2})\.md$/.exec(f)?.[1])
        .filter((d): d is string => !!d && d >= since && d <= until)
        .sort();
      if (dates.length === 0) continue;

      const outDir = path.join(dir, ".out");
      outDirs.push(outDir);

      if (opts.png !== false) {
        const items: RenderItem[] = dates.map((d) => ({
          md: fs.readFileSync(path.join(dir, `${d}.md`), "utf8"),
          outPath: path.join(outDir, "daily", `${d}.png`),
        }));
        const spin = clack.spinner();
        spin.start(t("{p}: PNG 렌더 중 (0/{total})", { p: project.id, total: items.length }));
        await renderPngs(items, (done, total) =>
          spin.message(t("{p}: PNG 렌더 중 ({done}/{total})", { p: project.id, done, total })),
        );
        spin.stop(t("{p}: PNG {n}장", { p: project.id, n: items.length }));
        totalPng += items.length;
      }

      if (opts.pdf) {
        const spin = clack.spinner();
        spin.start(t("{p}: PDF 렌더 중", { p: project.id }));
        const mds = dates.map((d) => fs.readFileSync(path.join(dir, `${d}.md`), "utf8"));
        const pdfPath = path.join(outDir, `notes_${since}_${until}.pdf`);
        await renderPdf(mds, pdfPath, `${cfg.author.name} · ${project.title} · openlabnote`);
        spin.stop(t("{p}: PDF 1개 ({dates}일치)", { p: project.id, dates: dates.length }));
        totalPdf += 1;
      }
    }
  } catch (e) {
    if (e instanceof RenderError) die(e.message, e.fix);
    throw e;
  }

  if (totalPng === 0 && totalPdf === 0) {
    info(t("내보낼 노트가 없습니다 ({since} ~ {until})", { since, until }));
    nextLine("oln catchup", "oln status");
    return;
  }

  ok(
    t("내보내기 완료: PNG {png}장{pdf}", {
      png: totalPng,
      pdf: totalPdf ? t(" · PDF {n}개", { n: totalPdf }) : "",
    }),
  );
  for (const d of outDirs) info(`  ${contractTilde(d)}`);
  if (opts.open && outDirs[0]) {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    spawnSync(opener, [outDirs[0]], { stdio: "ignore" });
  }
  if (opts.pdf) nextLine(t("oln open  — 노트 폴더 열기"), t("oln ui  — 웹 뷰어로 보기"));
  else nextLine(t("oln export --pdf  — 기간 PDF 포함"), t("oln open  — 노트 폴더 열기"));
}

export type { Config };
