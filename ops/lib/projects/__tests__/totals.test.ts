import { describe, expect, test } from "vitest";
import {
  outstanding,
  projectContractValue,
  quoteContractValue,
  totalReceived,
  type ProjectQuoteRow,
} from "../totals";
import { Decimal } from "@/lib/pricing/decimal";

const accepted = (id: string, total: string): ProjectQuoteRow => ({
  id,
  status: "ACCEPTED",
  acceptedTotal: total,
  fallbackTotal: null,
});
const advancePaid = (id: string, total: string): ProjectQuoteRow => ({
  id,
  status: "ADVANCE_PAID",
  acceptedTotal: total,
  fallbackTotal: null,
});

describe("project totals helpers", () => {
  test("draft / sent quotes contribute 0 to project value (not yet booked)", () => {
    expect(
      quoteContractValue({
        id: "1",
        status: "DRAFT",
        acceptedTotal: null,
        fallbackTotal: "100000",
      }).toFixed(2),
    ).toBe("0.00");
    expect(
      quoteContractValue({
        id: "2",
        status: "SENT",
        acceptedTotal: null,
        fallbackTotal: "100000",
      }).toFixed(2),
    ).toBe("0.00");
  });

  test("accepted quote uses accepted_total when set", () => {
    expect(quoteContractValue(accepted("1", "171947.76")).toFixed(2)).toBe(
      "171947.76",
    );
  });

  test("accepted quote falls back to fallbackTotal when accepted_total is null", () => {
    expect(
      quoteContractValue({
        id: "1",
        status: "ACCEPTED",
        acceptedTotal: null,
        fallbackTotal: "171947.76",
      }).toFixed(2),
    ).toBe("171947.76");
  });

  test("project value sums accepted parent + addendums; ignores draft addendums", () => {
    const rows: ProjectQuoteRow[] = [
      accepted("parent", "171947.76"),
      advancePaid("addendum-1", "25000"),
      {
        id: "addendum-2-draft",
        status: "DRAFT",
        acceptedTotal: null,
        fallbackTotal: "10000",
      },
    ];
    expect(projectContractValue(rows).toFixed(2)).toBe("196947.76");
  });

  test("totalReceived sums payments; refunds subtract", () => {
    expect(
      totalReceived([
        { amount: "50000", paymentType: "ADVANCE" },
        { amount: "75000", paymentType: "INTERIM" },
        { amount: "5000", paymentType: "REFUND" },
      ]).toFixed(2),
    ).toBe("120000.00");
  });

  test("outstanding floors at 0 (no negative on slight overpayment)", () => {
    const contract = new Decimal("100000");
    const overpaid = new Decimal("100050");
    expect(outstanding(contract, overpaid).toFixed(2)).toBe("0.00");
  });

  test("outstanding = contract − received for normal case", () => {
    const contract = new Decimal("171947.76");
    const received = new Decimal("85973.88"); // 50%
    expect(outstanding(contract, received).toFixed(2)).toBe("85973.88");
  });
});
