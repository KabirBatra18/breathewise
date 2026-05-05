import { Decimal, type DecimalInput, toMoney } from "./decimal";

const GST_DIVISOR = new Decimal("1.18");

export interface LineInput {
  qty: DecimalInput;
  unitPrice: DecimalInput;
  costPriceSnapshot?: DecimalInput | null;
  // GST-inclusive list price for one unit. Used to compute the
  // "list-price-anchored" totals shown to the client (so they see
  // both the implicit Astberg DP markdown AND the blanket discount
  // rolled into one number). Falls back to unitPrice (no implicit
  // markdown) when null — labour lines and custom items.
  mrp?: DecimalInput | null;
}

export function computeLineAmount(line: LineInput): Decimal {
  return toMoney(new Decimal(line.qty).mul(line.unitPrice));
}

export function computeLineCost(line: LineInput): Decimal {
  if (line.costPriceSnapshot == null) return new Decimal(0);
  return toMoney(new Decimal(line.qty).mul(line.costPriceSnapshot));
}

// Ex-GST list value of one line: qty × (mrp / 1.18). When the line
// has no mrp we fall back to its unit-price subtotal so the line
// neither inflates nor deflates the section's list total.
export function computeLineMrpAmount(line: LineInput): Decimal {
  if (line.mrp == null) return computeLineAmount(line);
  const exGst = new Decimal(line.mrp).div(GST_DIVISOR);
  return toMoney(new Decimal(line.qty).mul(exGst));
}
