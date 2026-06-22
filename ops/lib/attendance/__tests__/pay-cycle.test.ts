import { describe, expect, it } from "vitest";
import {
  addDays,
  currentPayCycle,
  listPayCyclesSince,
  previousPayCycle,
} from "../pay-cycle";

/**
 * Pay-cycle math for the per-employee-joined-on-anchored pay model
 * agreed with Kabir on 2026-06-22. The salary-critical bit: which
 * date range gets summed for an employee's monthly salary depends
 * on these calculations being correct.
 */

describe("currentPayCycle — basic mid-month joiner", () => {
  // Employee joined 2026-04-13. Pay date is the 13th of each month.
  const joinedOn = "2026-04-13";

  it("On Jul 1 → current cycle ends Jul 13", () => {
    const c = currentPayCycle({ joinedOn, asOf: "2026-07-01" });
    expect(c.payDate).toBe("2026-07-13");
    expect(c.start).toBe("2026-06-14");
    expect(c.end).toBe("2026-07-13");
    expect(c.isComplete).toBe(false);
  });

  it("On the pay date itself (Jul 13) → still current (not yet complete)", () => {
    const c = currentPayCycle({ joinedOn, asOf: "2026-07-13" });
    expect(c.payDate).toBe("2026-07-13");
    expect(c.isComplete).toBe(false);
  });

  it("Day after pay date (Jul 14) → previous cycle is complete, new one starts", () => {
    const c = currentPayCycle({ joinedOn, asOf: "2026-07-14" });
    expect(c.payDate).toBe("2026-08-13");
    expect(c.start).toBe("2026-07-14");
    expect(c.end).toBe("2026-08-13");
    expect(c.isComplete).toBe(false);
  });

  it("Querying back to the joining month → cycle start clamps to joined_on", () => {
    // First-ever cycle for an Apr 13 joiner: Apr 13 → May 13 (not
    // Mar 14 → Apr 13). The clamp lets new employees have a clean
    // partial-month cycle starting on their join date.
    const c = currentPayCycle({ joinedOn, asOf: "2026-04-25" });
    expect(c.payDate).toBe("2026-05-13");
    expect(c.start).toBe("2026-04-14"); // day after Apr 13 = day after pay date
  });

  it("Asking about a cycle that ended in the past (e.g. via listPayCyclesSince)", () => {
    const c = currentPayCycle({ joinedOn, asOf: "2026-06-13" });
    expect(c.payDate).toBe("2026-06-13");
    expect(c.start).toBe("2026-05-14");
    expect(c.end).toBe("2026-06-13");
    expect(c.isComplete).toBe(false); // = pay date so still current
  });
});

describe("currentPayCycle — end-of-month joiner (day 31)", () => {
  const joinedOn = "2026-01-31";

  it("Feb has no 31st → pay date clamps to Feb 28", () => {
    const c = currentPayCycle({ joinedOn, asOf: "2026-02-15" });
    expect(c.payDate).toBe("2026-02-28");
    expect(c.start).toBe("2026-02-01"); // day after Jan 31 = Feb 1
  });
  it("Apr has 30 days → pay date clamps to Apr 30", () => {
    const c = currentPayCycle({ joinedOn, asOf: "2026-04-10" });
    expect(c.payDate).toBe("2026-04-30");
    // Day after Mar 31 = Apr 1
    expect(c.start).toBe("2026-04-01");
  });
  it("May (31 days) → pay date is May 31", () => {
    const c = currentPayCycle({ joinedOn, asOf: "2026-05-15" });
    expect(c.payDate).toBe("2026-05-31");
    // Prev pay date was Apr 30 (clamped). Cycle start = May 1.
    expect(c.start).toBe("2026-05-01");
  });
});

describe("currentPayCycle — same-day boundary", () => {
  const joinedOn = "2026-06-13";

  it("On exactly the pay date → still in current cycle (not next)", () => {
    // This matters: Kabir said "I pay them on the same date" — if it's
    // the 13th and pay is the 13th, that day's punch IS the last day
    // of the cycle that's about to be paid.
    const c = currentPayCycle({ joinedOn, asOf: "2026-08-13" });
    expect(c.payDate).toBe("2026-08-13");
    expect(c.start).toBe("2026-07-14");
  });

  it("On the day after, the next cycle is current", () => {
    const c = currentPayCycle({ joinedOn, asOf: "2026-08-14" });
    expect(c.payDate).toBe("2026-09-13");
    expect(c.start).toBe("2026-08-14");
  });
});

describe("previousPayCycle", () => {
  const joinedOn = "2026-04-13";

  it("Returns the most recently completed cycle", () => {
    const c = previousPayCycle({ joinedOn, asOf: "2026-07-25" });
    expect(c?.payDate).toBe("2026-07-13");
    expect(c?.start).toBe("2026-06-14");
    expect(c?.end).toBe("2026-07-13");
  });

  it("Returns null when employee is in their very first cycle", () => {
    // Joined Apr 13, today is Apr 25. No previous cycle exists.
    const c = previousPayCycle({ joinedOn, asOf: "2026-04-25" });
    expect(c).toBe(null);
  });
});

describe("listPayCyclesSince", () => {
  const joinedOn = "2026-04-13";

  it("Lists every cycle from joining up to current", () => {
    const cycles = listPayCyclesSince({ joinedOn, asOf: "2026-07-25" });
    expect(cycles.length).toBe(4); // May 13, Jun 13, Jul 13, current Aug 13
    expect(cycles[0].payDate).toBe("2026-05-13");
    expect(cycles[1].payDate).toBe("2026-06-13");
    expect(cycles[2].payDate).toBe("2026-07-13");
    expect(cycles[3].payDate).toBe("2026-08-13");
    expect(cycles[3].isComplete).toBe(false);
    expect(cycles[0].isComplete).toBe(true);
  });

  it("Brand-new employee: just one cycle", () => {
    const cycles = listPayCyclesSince({ joinedOn, asOf: "2026-04-20" });
    expect(cycles.length).toBe(1);
    expect(cycles[0].isComplete).toBe(false);
  });
});

describe("addDays", () => {
  it("forward across month boundary", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
  });
  it("backward across month boundary", () => {
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
  it("forward across year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("zero delta is identity", () => {
    expect(addDays("2026-06-15", 0)).toBe("2026-06-15");
  });
  it("Feb 28 → Feb 29 in a leap year", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});
