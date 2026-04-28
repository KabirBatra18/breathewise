import { Decimal, type DecimalInput, toMoney } from "./decimal";

export interface LineInput {
  qty: DecimalInput;
  unitPrice: DecimalInput;
  costPriceSnapshot?: DecimalInput | null;
}

export function computeLineAmount(line: LineInput): Decimal {
  return toMoney(new Decimal(line.qty).mul(line.unitPrice));
}

export function computeLineCost(line: LineInput): Decimal {
  if (line.costPriceSnapshot == null) return new Decimal(0);
  return toMoney(new Decimal(line.qty).mul(line.costPriceSnapshot));
}
