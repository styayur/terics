import { describe, expect, it } from "vitest";
import {
  extractWeekRule,
  parsePeriodRange,
  parseWeeksDetailed,
  parseWeekday,
} from "../src/core/weeks";
import { dateForClass, mondayOfIso } from "../src/core/dates";

describe("week and period rules", () => {
  it("parses ranges, odd/even weeks and sparse weeks", () => {
    expect(parseWeeksDetailed("1-16单").weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    expect(parseWeeksDetailed("2-16周(双)").weeks).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(parseWeeksDetailed("第1-2周，4、6").weeks).toEqual([1, 2, 4, 6]);
    expect(parseWeeksDetailed("1-8,10-16").weeks).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });

  it("rejects out-of-range or malformed weeks", () => {
    expect(parseWeeksDetailed("1-31").error).toMatch(/超出支持上限/);
    expect(parseWeeksDetailed("abc").error).toMatch(/无法识别/);
    expect(parseWeeksDetailed("8-2").error).toMatch(/范围无效/);
  });

  it("extracts a week rule from an exam-system cell without confusing section numbers", () => {
    const match = extractWeekRule("1-16(周)[01-02节] 星期一 教1-101");
    expect(match?.rule).toContain("1-16");
    expect(parsePeriodRange("1-16(周)[01-02节] 星期一 教1-101")).toMatchObject({
      start: 1,
      end: 2,
    });
    expect(parsePeriodRange("五[3-4节] 教1-101")).toMatchObject({ start: 3, end: 4 });
    expect(parsePeriodRange("第5节")).toMatchObject({ start: 5, end: 5 });
    expect(parsePeriodRange("4")).toMatchObject({ start: 4, end: 4 });
  });

  it("parses Chinese and English weekdays", () => {
    expect(parseWeekday("星期一")).toBe(1);
    expect(parseWeekday("周四")).toBe(4);
    expect(parseWeekday("日")).toBe(7);
    expect(parseWeekday("Friday")).toBe(5);
    expect(parseWeekday("7")).toBe(7);
  });

  it("aligns a date to Monday and computes cross-month and cross-year class dates", () => {
    expect(mondayOfIso("2026-09-02")).toBe("2026-08-31");
    expect(dateForClass("2026-08-31", 1, 1)).toBe("2026-08-31");
    expect(dateForClass("2026-08-31", 18, 6)).toBe("2027-01-02");
    expect(dateForClass("2026-08-31", 20, 6)).toBe("2027-01-16");
  });
});
