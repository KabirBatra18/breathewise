import { describe, expect, it } from "vitest";
import { hourlyBuckets } from "../task-buckets";

/**
 * Hour-bucket math for the end-of-day task log UI. The numbers here
 * determine how many rows the employee sees on the "Log your day"
 * screen — get them wrong and the UX is annoying (too many rows) or
 * incomplete (missing time).
 */

// Helper: build an IST-clock Date for a given hour:minute on 2026-06-22.
function ist(hour: number, minute: number = 0): Date {
  // 2026-06-22 10:00 IST = 2026-06-22 04:30 UTC
  return new Date(
    Date.UTC(2026, 5, 22, hour - 5, minute - 30 + (minute - 30 < 0 ? 60 : 0)),
  );
}

// Simpler/safer helper using ISO string literal.
function istOf(timeHHMM: string): Date {
  return new Date(`2026-06-22T${timeHHMM}:00+05:30`);
}

describe("hourlyBuckets", () => {
  it("Mid-hour start + mid-hour end → 5 buckets (partial first + 3 whole + partial last)", () => {
    const buckets = hourlyBuckets(istOf("10:23"), istOf("14:12"));
    expect(buckets).toHaveLength(5);
    expect(buckets[0].minutes).toBe(37); // 10:23 → 11:00
    expect(buckets[1].minutes).toBe(60); // 11:00 → 12:00
    expect(buckets[2].minutes).toBe(60);
    expect(buckets[3].minutes).toBe(60);
    expect(buckets[4].minutes).toBe(12); // 14:00 → 14:12
  });

  it("Whole-hour start AND end → buckets are clean 60-min blocks", () => {
    const buckets = hourlyBuckets(istOf("10:00"), istOf("14:00"));
    expect(buckets).toHaveLength(4);
    buckets.forEach((b) => expect(b.minutes).toBe(60));
  });

  it("Sub-hour shift (10:10 → 10:50) → single 40-min bucket", () => {
    const buckets = hourlyBuckets(istOf("10:10"), istOf("10:50"));
    expect(buckets).toHaveLength(1);
    expect(buckets[0].minutes).toBe(40);
  });

  it("Shift crossing midnight gracefully (rare but possible)", () => {
    const checkIn = new Date("2026-06-22T22:00:00+05:30");
    const checkOut = new Date("2026-06-23T02:30:00+05:30");
    const buckets = hourlyBuckets(checkIn, checkOut);
    expect(buckets).toHaveLength(5); // 22:00, 23:00, 00:00, 01:00, 02:00→02:30
    expect(buckets[4].minutes).toBe(30);
  });

  it("Zero-duration shift → empty array (defensive)", () => {
    const t = istOf("10:00");
    expect(hourlyBuckets(t, t)).toEqual([]);
  });

  it("Checkout before checkin → empty array (defensive)", () => {
    expect(hourlyBuckets(istOf("14:00"), istOf("10:00"))).toEqual([]);
  });

  it("First and last bucket include IST labels in 12-hour format", () => {
    const buckets = hourlyBuckets(istOf("09:55"), istOf("13:05"));
    expect(buckets[0].label).toContain("9:55");
    expect(buckets[0].label).toContain("10:00");
    expect(buckets[buckets.length - 1].label).toContain("1:05");
  });

  it("Long shift (8 hours) → 8 buckets exactly", () => {
    const buckets = hourlyBuckets(istOf("10:00"), istOf("18:00"));
    expect(buckets).toHaveLength(8);
  });
});

// Silence the unused-helper warning by referencing it.
void ist;
