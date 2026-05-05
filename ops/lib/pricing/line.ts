import { Decimal, type DecimalInput, toMoney } from "./decimal";

export interface LineInput {
  qty: DecimalInput;
  unitPrice: DecimalInput;
  costPriceSnapshot?: DecimalInput | null;
  // GST-inclusive list price for one unit (the printed MRP). Used by
  // the section roll-up to compute the client-facing "you save vs
  // list" figure. Null means there's no list anchor (labour lines,
  // custom items) — those contribute their own face value to the list
  // total so they don't fake any markdown.
  mrp?: DecimalInput | null;
}

export function computeLineAmount(line: LineInput): Decimal {
  return toMoney(new Decimal(line.qty).mul(line.unitPrice));
}

export function computeLineCost(line: LineInput): Decimal {
  if (line.costPriceSnapshot == null) return new Decimal(0);
  return toMoney(new Decimal(line.qty).mul(line.costPriceSnapshot));
}
