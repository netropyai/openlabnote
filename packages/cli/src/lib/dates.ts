const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type Ymd = string; // "YYYY-MM-DD"

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYmd(s: string): s is Ymd {
  if (!YMD_RE.test(s)) return false;
  const d = fromYmd(s);
  return toYmd(d) === s;
}

export function toYmd(d: Date): Ymd {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromYmd(s: Ymd): Date {
  const m = YMD_RE.exec(s);
  if (!m) throw new Error(`잘못된 날짜 형식: ${s} (YYYY-MM-DD)`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function todayYmd(): Ymd {
  return toYmd(new Date());
}

export function addDays(s: Ymd, n: number): Ymd {
  const d = fromYmd(s);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

/** since ≤ d ≤ until 의 모든 날짜 (오름차순) */
export function enumerateDays(since: Ymd, until: Ymd): Ymd[] {
  const out: Ymd[] = [];
  let cur = since;
  while (cur <= until) {
    out.push(cur);
    cur = addDays(cur, 1);
    if (out.length > 3700) throw new Error("날짜 범위가 10년을 넘습니다 — --since/--until을 확인하세요");
  }
  return out;
}

/** ISO 타임스탬프(UTC 포함)를 로컬 기준 YYYY-MM-DD로 */
export function isoToLocalYmd(iso: string): Ymd | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toYmd(d);
}

export function isoToLocalHm(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** 노트 헤딩용: "August 21, 2026" */
export function ymdToHeading(s: Ymd): string {
  const d = fromYmd(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "## @August 21, 2026" → "2026-08-21" (실패 시 null) */
export function headingToYmd(heading: string): Ymd | null {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(heading.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1] as (typeof MONTHS)[number]);
  if (month < 0) return null;
  return toYmd(new Date(Number(m[3]), month, Number(m[2])));
}

/** 그 주 월요일 */
export function mondayOf(s: Ymd): Ymd {
  const d = fromYmd(s);
  const dow = (d.getDay() + 6) % 7; // 월=0 … 일=6
  return addDays(s, -dow);
}
