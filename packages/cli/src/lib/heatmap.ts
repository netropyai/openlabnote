import pc from "picocolors";
import { t } from "./i18n.js";
import { addDays, mondayOf, todayYmd } from "./dates.js";
import { daySymbol, type StateMap } from "./state.js";

const SYMBOLS = {
  full: pc.green("●"),
  partial: pc.yellow("◐"),
  activity: pc.red("○"),
  none: pc.dim("·"),
  today: pc.cyan("▷"),
  future: " ",
} as const;

/** 최근 N주 히트맵 (월~일 행) */
export function renderHeatmap(states: StateMap, weeks: number): string {
  const today = todayYmd();
  const lastMonday = mondayOf(today);
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));

  const lines: string[] = [];
  lines.push(pc.dim(t("             월 화 수 목 금 토 일")));
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(firstMonday, w * 7);
    const cells: string[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(monday, d);
      if (day > today) {
        cells.push(SYMBOLS.future);
        continue;
      }
      const sym = daySymbol(states, day);
      if (day === today && sym !== "full" && sym !== "partial") cells.push(SYMBOLS.today);
      else cells.push(SYMBOLS[sym]);
    }
    const label = `${monday.slice(5).replace("-", "/")}~`;
    lines.push(`  ${label.padEnd(9)}  ${cells.join("  ")}`);
  }
  lines.push(
    pc.dim(
      "  " +
        t("{full} 전과제 작성  {partial} 일부 작성  {activity} 기록만 있음  {today} 오늘", {
          full: SYMBOLS.full,
          partial: SYMBOLS.partial,
          activity: SYMBOLS.activity,
          today: SYMBOLS.today,
        }),
    ),
  );
  return lines.join("\n");
}
