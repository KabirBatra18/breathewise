import { Decimal, type DecimalInput } from "./decimal";
import { computeFinancials, type Financials } from "./financials";
import { computeGrandTotal } from "./quote";
import type { SectionInput } from "./section";

export type Role = "OWNER" | "EMPLOYEE" | "VIEWER";

export interface PreciseTierInput {
  sections: Omit<SectionInput, "discountPercent">[];
  discountTiers: DecimalInput[];
}

export interface PreciseTier {
  tierLabel: "Q1" | "Q2" | "Q3" | string;
  discountPercent: Decimal;
  grandTotal: Decimal;
  financials?: Financials;
}

export function computePreciseTiers(
  input: PreciseTierInput,
  role: Role,
): PreciseTier[] {
  return input.discountTiers.map((pct, i) => {
    const discountPercent = new Decimal(pct);
    const sectionsForTier: SectionInput[] = input.sections.map((s) => ({
      ...s,
      discountPercent,
    }));
    const grandTotal = computeGrandTotal(sectionsForTier);
    const tier: PreciseTier = {
      tierLabel: `Q${i + 1}`,
      discountPercent,
      grandTotal,
    };
    if (role === "OWNER") {
      tier.financials = computeFinancials(sectionsForTier);
    }
    return tier;
  });
}
