import Decimal from "decimal.js";

// Global configuration: all money math in this app uses HALF_UP rounding
// (Indian invoicing convention) and 20-digit precision (plenty of headroom
// above the 12,2 Postgres NUMERIC boundary).
Decimal.set({
  rounding: Decimal.ROUND_HALF_UP,
  precision: 20,
});

export { Decimal };

export type DecimalInput = string | number | Decimal;

export const ZERO = new Decimal(0);

export function toMoney(value: DecimalInput): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
