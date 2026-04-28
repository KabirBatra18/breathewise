import { Decimal } from "./decimal";

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function words0to99(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? TENS[t] : `${TENS[t]}-${ONES[u]}`;
}

function wordsIndian(n: number): string {
  if (n === 0) return "Zero";

  const crores = Math.floor(n / 10_000_000);
  const lakhs = Math.floor(n / 100_000) % 100;
  const thousands = Math.floor(n / 1000) % 100;
  const hundreds = Math.floor(n / 100) % 10;
  const tensUnits = n % 100;

  const parts: string[] = [];
  if (crores) parts.push(words0to99(crores), "Crore");
  if (lakhs) parts.push(words0to99(lakhs), "Lakh");
  if (thousands) parts.push(words0to99(thousands), "Thousand");
  if (hundreds) parts.push(words0to99(hundreds), "Hundred");
  if (tensUnits) {
    // "and" joins the tens/units to the preceding hundreds in Indian English.
    if (hundreds) parts.push("and");
    parts.push(words0to99(tensUnits));
  }
  return parts.join(" ");
}

export function amountInWords(value: Decimal): string {
  // Round paise HALF_UP to whole rupees before conversion, per Indian
  // invoicing convention.
  const rupees = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return `Rupees ${wordsIndian(rupees)} Only`;
}
