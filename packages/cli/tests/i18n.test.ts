import { afterEach, describe, expect, it } from "vitest";
import { detectSystemLocale, setLocale, t } from "../src/lib/i18n.js";

afterEach(() => setLocale("ko"));

describe("i18n", () => {
  it("ko 로케일은 키(한국어)를 그대로 반환한다", () => {
    setLocale("ko");
    expect(t("수집")).toBe("수집");
  });

  it("en 로케일은 카탈로그 번역을 반환한다", () => {
    setLocale("en");
    expect(t("수집")).toBe("Collect");
    expect(t("취소됨")).toBe("Cancelled");
  });

  it("파라미터를 치환한다 (양쪽 로케일)", () => {
    setLocale("ko");
    expect(t("과제 {n} 이름 (정식 과제명 또는 짧은 이름)", { n: 2 })).toContain("과제 2");
    setLocale("en");
    expect(t("완료: {n}건 작성{draft}", { n: 3, draft: "" })).toBe("Done: 3 written");
  });

  it("카탈로그에 없는 키는 en에서도 한국어로 폴백한다", () => {
    setLocale("en");
    expect(t("존재하지 않는 키")).toBe("존재하지 않는 키");
  });

  it("OLN_LANG이 시스템 추정을 우선한다", () => {
    const orig = process.env.OLN_LANG;
    process.env.OLN_LANG = "en";
    expect(detectSystemLocale()).toBe("en");
    process.env.OLN_LANG = "ko_KR.UTF-8";
    expect(detectSystemLocale()).toBe("ko");
    if (orig === undefined) delete process.env.OLN_LANG;
    else process.env.OLN_LANG = orig;
  });
});
