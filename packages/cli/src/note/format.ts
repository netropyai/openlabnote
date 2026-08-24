import { headingToYmd, type Ymd } from "../lib/dates.js";

/**
 * 노트 포맷 v1 (docs/note-format.md 가 정본 스펙)
 *
 * ## @August 21, 2026        ← 날짜 헤딩, 파일당 정확히 1개
 *
 * ### Topic title            ← 주제, 하루 ≤ 4
 * - bullet ≤ 110자           ← 하루 ≤ 12, 하위 불릿 금지
 *
 * <!-- FIG: /abs/path.png | 캡션 -->   ← 실존 파일만, 하루 ≤ 2
 */

export interface NoteFig {
  path: string;
  caption: string;
  line: number;
}

export interface NoteTopic {
  title: string;
  line: number;
  bullets: { text: string; line: number }[];
}

export interface ParsedNote {
  /** 헤딩에서 파싱된 날짜 (없거나 형식 오류면 null) */
  date: Ymd | null;
  headingCount: number;
  topics: NoteTopic[];
  figs: NoteFig[];
  /** 하위 불릿(들여쓰기 불릿) 라인 번호들 */
  subBullets: number[];
  /** 어떤 구조에도 속하지 않는 본문 텍스트 라인 (문단 서술) */
  proseLines: number[];
}

const FIG_RE = /^<!--\s*FIG:\s*(.+?)\s*\|\s*(.+?)\s*-->$/;

export function parseNote(md: string): ParsedNote {
  const lines = md.split("\n");
  const note: ParsedNote = {
    date: null,
    headingCount: 0,
    topics: [],
    figs: [],
    subBullets: [],
    proseLines: [],
  };
  let current: NoteTopic | null = null;

  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const n = i + 1;
    if (line.startsWith("## @")) {
      note.headingCount += 1;
      if (note.headingCount === 1) note.date = headingToYmd(line.slice(4));
      return;
    }
    if (line.startsWith("### ")) {
      current = { title: line.slice(4).trim(), line: n, bullets: [] };
      note.topics.push(current);
      return;
    }
    const fig = FIG_RE.exec(line);
    if (fig) {
      note.figs.push({ path: fig[1] ?? "", caption: fig[2] ?? "", line: n });
      return;
    }
    if (/^- /.test(line)) {
      const bullet = { text: line.slice(2).trim(), line: n };
      if (current) current.bullets.push(bullet);
      else {
        // 주제 없이 등장한 불릿 — 구조상 topics[0] 이전: 별도 주제로 취급하지 않고 prose로 분류
        note.proseLines.push(n);
      }
      return;
    }
    if (/^\s+[-*] /.test(line)) {
      note.subBullets.push(n);
      return;
    }
    if (line.trim() !== "" && !line.startsWith("<!--")) {
      note.proseLines.push(n);
    }
  });

  return note;
}

export function bulletCount(note: ParsedNote): number {
  return note.topics.reduce((acc, t) => acc + t.bullets.length, 0);
}
