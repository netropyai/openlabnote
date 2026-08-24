import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { loadConfig } from "../lib/config.js";
import { expandTilde, contractTilde } from "../lib/paths.js";
import { lintNote } from "../note/lint.js";
import { scanSecrets, type SecretFinding } from "../lib/redact.js";
import { t } from "../lib/i18n.js";
import { info, nextLine, ok, fail } from "../lib/ui.js";

export interface LintOptions {
  project?: string;
  date?: string;
  json?: boolean;
}

interface FileReport {
  file: string;
  projectId: string;
  date: string;
  ok: boolean;
  issues: ReturnType<typeof lintNote>["issues"];
  /** 형식 검사와 별개의 시크릿 경고 — exit code에는 영향 없음 (차단은 export/push 시점) */
  secrets: SecretFinding[];
}

export function lintCommand(opts: LintOptions): void {
  const cfg = loadConfig();
  const base = expandTilde(cfg.notesDir);
  const reports: FileReport[] = [];

  for (const project of cfg.projects) {
    if (opts.project && project.id !== opts.project) continue;
    const dir = path.join(base, project.id);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const m = /^(\d{4}-\d{2}-\d{2})(\.draft)?\.md$/.exec(name);
      if (!m) continue;
      const date = m[1] ?? "";
      if (opts.date && date !== opts.date) continue;
      const fp = path.join(dir, name);
      const body = fs.readFileSync(fp, "utf8");
      const result = lintNote(body, { expectedDate: date, checkFigFiles: true });
      reports.push({
        file: fp,
        projectId: project.id,
        date,
        ok: result.ok,
        issues: result.issues,
        secrets: scanSecrets(body),
      });
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(reports, null, 2));
    process.exitCode = reports.some((r) => !r.ok) ? 1 : 0;
    return;
  }

  if (reports.length === 0) {
    info(t("검사할 노트가 없습니다"));
    nextLine("oln today");
    return;
  }

  let bad = 0;
  let secretTotal = 0;
  for (const r of reports) {
    if (r.ok && r.issues.length === 0 && r.secrets.length === 0) continue;
    if (!r.ok) bad += 1;
    const label = `${r.date} · ${r.projectId}`;
    if (r.ok) info(`${pc.yellow("!")} ${label} ${pc.dim(contractTilde(r.file))}`);
    else fail(`${label} ${pc.dim(contractTilde(r.file))}`);
    for (const i of r.issues) {
      const mark = i.severity === "error" ? pc.red(`[${i.code}]`) : pc.yellow(`[${i.code}]`);
      info(`   ${mark} ${i.message}${i.line ? pc.dim(` (L${i.line})`) : ""}`);
    }
    for (const sIssue of r.secrets) {
      secretTotal += 1;
      info(`   ${pc.yellow("[SECRET]")} ${t(sIssue.label)}: ${sIssue.masked}${pc.dim(` (L${sIssue.line})`)}`);
    }
  }
  if (secretTotal > 0) {
    info(pc.yellow(t("시크릿 의심 {n}건 — 내보내기(export)·업로드 시 차단됩니다. 실제 키라면 노트에서 지우세요.", { n: secretTotal })));
  }
  if (bad === 0) ok(t("전체 통과 — {n}건", { n: reports.length }));
  else {
    fail(t("오류 {n}건 / 전체 {total}건", { n: bad, total: reports.length }));
    process.exitCode = 1;
  }
  nextLine(t("oln note <date> --edit  — 수정"), t("oln note <date> --regen  — 다시 작성"));
}
