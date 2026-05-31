import { format } from "date-fns";

/**
 * Format a Postgres `date` column (which Drizzle hands us as a string
 * like "2026-05-31") OR a Date / ISO string into Indian-friendly
 * "31 May 2026". Returns the input string unchanged if it can't be
 * parsed — defensive so a malformed value never crashes a render.
 *
 * `date-fns` was already imported across the route handlers; this
 * helper centralises the conversion so we stop sprinkling
 * `r.issueDate as unknown as string` and `format(new Date(...), ...)`
 * recipes across every list/detail page.
 */
export function formatIST(
  value: Date | string | null | undefined,
): string {
  if (value == null) return "—";
  if (value === "") return "—";
  try {
    // Postgres date columns serialize as "YYYY-MM-DD" (no time). We
    // append a fixed local time so Date doesn't shift the date across
    // the UTC boundary when the host is in a Western timezone.
    const d =
      typeof value === "string"
        ? new Date(value.length === 10 ? `${value}T00:00:00` : value)
        : value;
    if (Number.isNaN(d.getTime())) return String(value);
    return format(d, "d MMM yyyy");
  } catch {
    return String(value);
  }
}

/**
 * Long form for headers / banners: "31 May 2026, 6:25 pm".
 * Use formatIST for tables; formatISTLong for prose contexts where
 * the time matters (canceled-on banner, audit log).
 */
export function formatISTLong(
  value: Date | string | null | undefined,
): string {
  if (value == null) return "—";
  if (value === "") return "—";
  try {
    const d =
      typeof value === "string"
        ? new Date(value.length === 10 ? `${value}T00:00:00` : value)
        : value;
    if (Number.isNaN(d.getTime())) return String(value);
    return format(d, "d MMMM yyyy, p");
  } catch {
    return String(value);
  }
}
