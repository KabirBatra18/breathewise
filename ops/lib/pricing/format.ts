import type { Decimal } from "./decimal";

export interface FormatOptions {
  negativeAsParens?: boolean;
}

// Indian digit grouping: the rightmost three digits form one group, everything
// else is grouped in twos. 1000 → 1,000 · 100000 → 1,00,000 · 1,67,217.74
export function formatIndianNumber(
  value: Decimal,
  opts: FormatOptions = {},
): string {
  const isNegative = value.isNegative();
  const abs = value.abs();
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");

  let grouped: string;
  if (intPart.length <= 3) {
    grouped = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const restGrouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${restGrouped},${last3}`;
  }

  const formatted = `${grouped}.${decPart}`;
  if (isNegative) {
    return opts.negativeAsParens ? `(${formatted})` : `-${formatted}`;
  }
  return formatted;
}

export function formatRupees(value: Decimal, opts: FormatOptions = {}): string {
  return `INR ${formatIndianNumber(value, opts)}`;
}
