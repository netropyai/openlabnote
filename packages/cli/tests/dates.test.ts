import { describe, expect, it } from "vitest";
import { addDays, enumerateDays, headingToYmd, isYmd, mondayOf, ymdToHeading } from "../src/lib/dates.js";

describe("dates", () => {
  it("ymdToHeading ↔ headingToYmd 왕복", () => {
    expect(ymdToHeading("2026-08-21")).toBe("August 21, 2026");
    expect(headingToYmd("August 21, 2026")).toBe("2026-08-21");
    expect(headingToYmd("Auggust 21, 2026")).toBeNull();
  });

  it("isYmd는 실존 날짜만 허용", () => {
    expect(isYmd("2026-08-21")).toBe(true);
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("2026-8-1")).toBe(false);
  });

  it("addDays는 월 경계를 넘는다", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("enumerateDays", () => {
    expect(enumerateDays("2026-08-30", "2026-09-01")).toEqual(["2026-08-30", "2026-08-31", "2026-09-01"]);
  });

  it("mondayOf", () => {
    expect(mondayOf("2026-08-22")).toBe("2026-08-17"); // 토요일 → 그 주 월요일
    expect(mondayOf("2026-08-17")).toBe("2026-08-17");
  });
});
