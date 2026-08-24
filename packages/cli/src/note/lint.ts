import fs from "node:fs";
import { bulletCount, parseNote } from "./format.js";
import { t } from "../lib/i18n.js";
import type { Ymd } from "../lib/dates.js";

export interface LintIssue {
  code: string;
  severity: "error" | "warn";
  message: string;
  line?: number;
}

export interface LintResult {
  ok: boolean;
  issues: LintIssue[];
  stats: { topics: number; bullets: number; figs: number };
}

export const LIMITS = {
  bulletLen: 110,
  bulletsPerDay: 12,
  topicsPerDay: 4,
  figsPerDay: 3,
} as const;

/** 메타서술 금지 패턴 — 연구자가 직접 한 일처럼 서술해야 한다 */
const META_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /(클로드|Claude|코덱스|Codex|AI|에이전트)(에게|한테)/, label: "AI에게 시켰다는 서술" },
  { re: /(라고|하라고|해달라고)\s*(시켰|요청했|지시했)/, label: "지시했다는 서술" },
  { re: /프롬프트(를|로)\s/, label: "프롬프트 언급" },
  { re: /\basked (Claude|Codex|the agent|AI)\b/i, label: "AI에게 시켰다는 서술(영문)" },
  { re: /\b(Claude|Codex) (did|wrote|implemented|generated)\b/i, label: "AI가 했다는 서술(영문)" },
];

/**
 * 노트 md를 검사한다.
 * expectedDate를 주면 헤딩 날짜와 파일명 날짜의 일치를 검사.
 * checkFigFiles=true면 FIG 경로 실존 검사(작성 직후 검증용).
 */
export function lintNote(
  md: string,
  opts: { expectedDate?: Ymd; checkFigFiles?: boolean } = {},
): LintResult {
  const note = parseNote(md);
  const issues: LintIssue[] = [];

  if (note.headingCount !== 1) {
    issues.push({
      code: "H1",
      severity: "error",
      message: t("날짜 헤딩(## @Month D, YYYY)이 정확히 1개여야 합니다 (현재 {n}개)", { n: note.headingCount }),
    });
  }
  if (note.headingCount >= 1 && note.date === null) {
    issues.push({ code: "H2", severity: "error", message: t("날짜 헤딩 형식이 올바르지 않습니다 (예: ## @August 21, 2026)") });
  }
  if (opts.expectedDate && note.date && note.date !== opts.expectedDate) {
    issues.push({
      code: "H3",
      severity: "error",
      message: t("헤딩 날짜({a})가 파일 날짜({b})와 다릅니다", { a: note.date, b: opts.expectedDate }),
    });
  }

  if (note.topics.length > LIMITS.topicsPerDay) {
    issues.push({
      code: "T1",
      severity: "warn",
      message: t("주제(###)가 {n}개 — 하루 {max}개 이하 권장", { n: note.topics.length, max: LIMITS.topicsPerDay }),
    });
  }
  if (note.topics.length === 0 || bulletCount(note) === 0) {
    issues.push({ code: "E1", severity: "error", message: t("내용이 비어 있습니다 (주제·불릿 없음)") });
  }

  for (const topic of note.topics) {
    for (const b of topic.bullets) {
      if (b.text.length > LIMITS.bulletLen) {
        issues.push({
          code: "B1",
          severity: "error",
          message: t("불릿이 {n}자 — {max}자 이하로 (「{preview}…」)", { n: b.text.length, max: LIMITS.bulletLen, preview: b.text.slice(0, 30) }),
          line: b.line,
        });
      }
      for (const { re, label } of META_PATTERNS) {
        if (re.test(b.text)) {
          issues.push({ code: "M1", severity: "error", message: t("메타서술 금지 ({label})", { label: t(label) }), line: b.line });
          break;
        }
      }
    }
  }

  const bullets = bulletCount(note);
  if (bullets > LIMITS.bulletsPerDay) {
    issues.push({
      code: "B2",
      severity: "warn",
      message: t("불릿이 {n}개 — 하루 {max}개 이하 권장", { n: bullets, max: LIMITS.bulletsPerDay }),
    });
  }
  for (const line of note.subBullets) {
    issues.push({ code: "B3", severity: "error", message: t("하위 불릿 금지 — 평탄화하세요"), line });
  }

  if (note.figs.length > LIMITS.figsPerDay) {
    issues.push({ code: "F2", severity: "warn", message: t("그림이 {n}개 — 하루 {max}개 이하", { n: note.figs.length, max: LIMITS.figsPerDay }) });
  }
  if (opts.checkFigFiles) {
    for (const fig of note.figs) {
      if (!fs.existsSync(fig.path)) {
        issues.push({ code: "F1", severity: "error", message: t("FIG 파일이 없습니다: {path}", { path: fig.path }), line: fig.line });
      }
    }
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    stats: { topics: note.topics.length, bullets, figs: note.figs.length },
  };
}
