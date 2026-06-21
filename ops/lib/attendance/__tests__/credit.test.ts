import { describe, expect, it } from "vitest";
import {
  computeHoursWorked,
  computeMonthlySalary,
  dayCredit,
  effectiveDayCredit,
  expectedCreditsForMonth,
} from "../credit";

/**
 * The day-credit algorithm is salary-critical. Every salary number an
 * employee sees comes through dayCredit() + effectiveDayCredit() +
 * computeMonthlySalary(). A regression here is a regression in payroll.
 *
 * These tests pin the rule Kabir approved on 2026-06-21:
 *   "every 2 hours = half a credit, floor to the nearest half-step,
 *    no grace anywhere."
 *
 * See memory/project_attendance_architecture.md for the full algorithm
 * specification.
 */

describe("dayCredit — half-shift stepped algorithm", () => {
  // expectedHoursPerDay = 4 (UTHS default)
  const EXPECTED = 4;

  describe("absent band (< half-shift)", () => {
    it("0 hours → 0 credit", () => {
      expect(dayCredit(0, EXPECTED)).toBe(0);
    });
    it("just under half-shift (1h59m) → 0 credit", () => {
      expect(dayCredit(1 + 59 / 60, EXPECTED)).toBe(0);
    });
    it("exactly half-shift (2h) → 0.5 credit (boundary)", () => {
      expect(dayCredit(2, EXPECTED)).toBe(0.5);
    });
  });

  describe("half-day penalty band (2h — 3h59m)", () => {
    it("2h → 0.5", () => {
      expect(dayCredit(2, EXPECTED)).toBe(0.5);
    });
    it("3h → 0.5", () => {
      expect(dayCredit(3, EXPECTED)).toBe(0.5);
    });
    it("3h40m (Kabir's 20-min-early case) → 0.5", () => {
      expect(dayCredit(3 + 40 / 60, EXPECTED)).toBe(0.5);
    });
    it("3h57m (3 min short, NO grace) → 0.5", () => {
      // Critical regression test: Kabir explicitly rejected a grace at
      // the 4h boundary. Leaving even 1-3 min early = half-day.
      expect(dayCredit(3 + 57 / 60, EXPECTED)).toBe(0.5);
    });
    it("3h59m59s → 0.5", () => {
      expect(dayCredit(3 + 59 / 60 + 59 / 3600, EXPECTED)).toBe(0.5);
    });
  });

  describe("normal day band (4h — 5h59m)", () => {
    it("exactly 4h → 1.0", () => {
      expect(dayCredit(4, EXPECTED)).toBe(1.0);
    });
    it("4h 1 min → 1.0", () => {
      expect(dayCredit(4 + 1 / 60, EXPECTED)).toBe(1.0);
    });
    it("5h → 1.0", () => {
      expect(dayCredit(5, EXPECTED)).toBe(1.0);
    });
    it("5h59m → 1.0", () => {
      expect(dayCredit(5 + 59 / 60, EXPECTED)).toBe(1.0);
    });
  });

  describe("day-and-a-half band (6h — 7h59m)", () => {
    it("6h → 1.5", () => {
      expect(dayCredit(6, EXPECTED)).toBe(1.5);
    });
    it("7h → 1.5", () => {
      expect(dayCredit(7, EXPECTED)).toBe(1.5);
    });
    it("7h45m (Kabir's 'should count for 1.5 at least' case) → 1.5", () => {
      expect(dayCredit(7 + 45 / 60, EXPECTED)).toBe(1.5);
    });
    it("7h59m → 1.5", () => {
      expect(dayCredit(7 + 59 / 60, EXPECTED)).toBe(1.5);
    });
  });

  describe("double-shift band (8h — 9h59m)", () => {
    it("exactly 8h → 2.0", () => {
      expect(dayCredit(8, EXPECTED)).toBe(2.0);
    });
    it("9h59m → 2.0", () => {
      expect(dayCredit(9 + 59 / 60, EXPECTED)).toBe(2.0);
    });
  });

  describe("higher multiples — uncapped", () => {
    it("10h → 2.5", () => {
      expect(dayCredit(10, EXPECTED)).toBe(2.5);
    });
    it("12h → 3.0", () => {
      expect(dayCredit(12, EXPECTED)).toBe(3.0);
    });
    it("14h → 3.5", () => {
      expect(dayCredit(14, EXPECTED)).toBe(3.5);
    });
    it("16h → 4.0", () => {
      expect(dayCredit(16, EXPECTED)).toBe(4.0);
    });
  });

  describe("alternate expected_hours_per_day values", () => {
    it("8h-day system: 4h → 0.5", () => {
      expect(dayCredit(4, 8)).toBe(0.5);
    });
    it("8h-day system: 8h → 1.0", () => {
      expect(dayCredit(8, 8)).toBe(1.0);
    });
    it("8h-day system: 12h → 1.5", () => {
      expect(dayCredit(12, 8)).toBe(1.5);
    });
    it("6h-day system: 3h → 0.5", () => {
      expect(dayCredit(3, 6)).toBe(0.5);
    });
    it("6h-day system: 6h → 1.0", () => {
      expect(dayCredit(6, 6)).toBe(1.0);
    });
  });

  describe("defensive inputs", () => {
    it("negative hours → 0", () => {
      expect(dayCredit(-1, EXPECTED)).toBe(0);
    });
    it("NaN hours → 0", () => {
      expect(dayCredit(NaN, EXPECTED)).toBe(0);
    });
    it("Infinity hours → 0 (treated as invalid)", () => {
      expect(dayCredit(Infinity, EXPECTED)).toBe(0);
    });
    it("non-positive expected throws", () => {
      expect(() => dayCredit(4, 0)).toThrow();
      expect(() => dayCredit(4, -1)).toThrow();
    });
  });
});

describe("computeHoursWorked", () => {
  it("standard 4-hour shift", () => {
    const inAt = new Date("2026-06-21T10:00:00Z");
    const outAt = new Date("2026-06-21T14:00:00Z");
    expect(computeHoursWorked(inAt, outAt)).toBe(4);
  });
  it("partial hour with 2-decimal precision", () => {
    const inAt = new Date("2026-06-21T10:00:00Z");
    const outAt = new Date("2026-06-21T14:15:00Z");
    expect(computeHoursWorked(inAt, outAt)).toBe(4.25);
  });
  it("null inputs → null", () => {
    expect(computeHoursWorked(null, new Date())).toBe(null);
    expect(computeHoursWorked(new Date(), null)).toBe(null);
  });
  it("checkout before checkin → null (anomaly)", () => {
    const inAt = new Date("2026-06-21T14:00:00Z");
    const outAt = new Date("2026-06-21T10:00:00Z");
    expect(computeHoursWorked(inAt, outAt)).toBe(null);
  });
});

describe("effectiveDayCredit — overrides take precedence", () => {
  it("PAID_LEAVE with no override_credit defaults to 1.0", () => {
    expect(
      effectiveDayCredit({
        dayCredit: null,
        overrideKind: "PAID_LEAVE",
        overrideCredit: null,
      }),
    ).toBe(1.0);
  });
  it("PAID_LEAVE with override_credit=0.5 (half-day leave)", () => {
    expect(
      effectiveDayCredit({
        dayCredit: null,
        overrideKind: "PAID_LEAVE",
        overrideCredit: "0.5",
      }),
    ).toBe(0.5);
  });
  it("UNPAID_LEAVE defaults to 0.0 (cuts the day from pay)", () => {
    expect(
      effectiveDayCredit({
        dayCredit: "1.0",
        overrideKind: "UNPAID_LEAVE",
        overrideCredit: null,
      }),
    ).toBe(0.0);
  });
  it("PUBLIC_HOLIDAY defaults to 1.0", () => {
    expect(
      effectiveDayCredit({
        dayCredit: null,
        overrideKind: "PUBLIC_HOLIDAY",
        overrideCredit: null,
      }),
    ).toBe(1.0);
  });
  it("no override — uses day_credit as-is", () => {
    expect(
      effectiveDayCredit({
        dayCredit: "1.5",
        overrideKind: null,
        overrideCredit: null,
      }),
    ).toBe(1.5);
  });
  it("override beats day_credit even when day_credit is set", () => {
    // E.g. they punched in, OWNER later marked the day as unpaid leave.
    expect(
      effectiveDayCredit({
        dayCredit: "1.0",
        overrideKind: "UNPAID_LEAVE",
        overrideCredit: null,
      }),
    ).toBe(0.0);
  });
});

describe("expectedCreditsForMonth", () => {
  it("30-day month with 1 weekly off, no holidays", () => {
    expect(
      expectedCreditsForMonth({
        daysInMonth: 30,
        weeklyOffsPerWeek: 1,
        publicHolidaysInMonth: 0,
      }),
    ).toBe(26); // 30 - 4 = 26
  });
  it("31-day month with 1 weekly off, no holidays", () => {
    expect(
      expectedCreditsForMonth({
        daysInMonth: 31,
        weeklyOffsPerWeek: 1,
        publicHolidaysInMonth: 0,
      }),
    ).toBe(27); // 31 - 4 = 27 (floor(31/7) = 4)
  });
  it("February 28 days, 1 weekly off", () => {
    expect(
      expectedCreditsForMonth({
        daysInMonth: 28,
        weeklyOffsPerWeek: 1,
        publicHolidaysInMonth: 0,
      }),
    ).toBe(24); // 28 - 4 = 24
  });
  it("subtracts public holidays", () => {
    expect(
      expectedCreditsForMonth({
        daysInMonth: 30,
        weeklyOffsPerWeek: 1,
        publicHolidaysInMonth: 2,
      }),
    ).toBe(24);
  });
  it("0 weekly offs → no subtraction", () => {
    expect(
      expectedCreditsForMonth({
        daysInMonth: 30,
        weeklyOffsPerWeek: 0,
        publicHolidaysInMonth: 0,
      }),
    ).toBe(30);
  });
});

describe("computeMonthlySalary — symmetric pro-rating", () => {
  it("full month: salary unchanged", () => {
    expect(
      computeMonthlySalary({
        monthlySalary: 30000,
        actualCredits: 26,
        expectedCredits: 26,
      }),
    ).toBe(30000);
  });
  it("overtime: pays more pro-rata", () => {
    // 27.5 credits delivered for an expected 26 → pay × (27.5/26)
    expect(
      computeMonthlySalary({
        monthlySalary: 30000,
        actualCredits: 27.5,
        expectedCredits: 26,
      }),
    ).toBe(31730.77);
  });
  it("undertime: pays less pro-rata", () => {
    expect(
      computeMonthlySalary({
        monthlySalary: 30000,
        actualCredits: 22,
        expectedCredits: 26,
      }),
    ).toBe(25384.62);
  });
  it("zero credits → zero pay", () => {
    expect(
      computeMonthlySalary({
        monthlySalary: 30000,
        actualCredits: 0,
        expectedCredits: 26,
      }),
    ).toBe(0);
  });
  it("zero expected (defensive) → zero pay", () => {
    expect(
      computeMonthlySalary({
        monthlySalary: 30000,
        actualCredits: 5,
        expectedCredits: 0,
      }),
    ).toBe(0);
  });
});
