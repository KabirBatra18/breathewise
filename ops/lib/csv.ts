/**
 * CSV escape helper hardened against formula-injection.
 *
 * Stock CSV escape only handles the syntactic concerns (quotes,
 * commas, newlines) — but a cell whose first character is `=`, `+`,
 * `-`, `@`, `\t`, or `\r` is interpreted as a formula by Excel and
 * Google Sheets when the file is opened. A user-supplied note like
 * `=HYPERLINK("http://evil",1)` or `=cmd|'/c calc'!A1` becomes
 * executable.
 *
 * Defense: prefix any such cell with a single quote `'`, which most
 * spreadsheet apps display as literal text and refuse to evaluate.
 */
const FORMULA_PREFIX_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  let s = String(value);
  if (s.length > 0 && FORMULA_PREFIX_CHARS.has(s[0]!)) {
    s = `'${s}`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
