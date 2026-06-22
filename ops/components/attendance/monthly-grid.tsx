import { cn } from "@/lib/utils";
import type { DayCell, MonthlyAttendance } from "@/lib/attendance/queries";
import { DayOverrideEditor } from "@/components/attendance/day-override-editor";

/**
 * Monthly grid. Defaults to pure-presentational (server component
 * compatible); when `editForUserId` is provided, each cell becomes
 * clickable and opens the DayOverrideEditor — used by OWNER for the
 * backfill flow (mark previously-untracked days as PAID_LEAVE etc).
 *
 * The grid is laid out as a flexbox of square cells (one per date),
 * wrapping naturally. Calendar-style placement (rows = weeks) was the
 * other option but adds complexity for the floating-weekly-off case
 * where Sunday isn't special.
 */
export function MonthlyGrid({
  attendance,
  showLegend = true,
  editForUserId,
}: {
  attendance: MonthlyAttendance | { actualCredits: number; expectedCredits: number; cells: DayCell[] };
  showLegend?: boolean;
  // When set, each cell is clickable and opens the override editor
  // for the given user. OWNER-only surface; do NOT pass on employee
  // self-view (/my-attendance).
  editForUserId?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {attendance.cells.map((cell) =>
          editForUserId ? (
            <DayOverrideEditor
              key={cell.date}
              userId={editForUserId}
              date={cell.date}
              existing={{
                dayId: cell.dayId,
                overrideKind: cell.overrideKind,
                overrideCredit: cell.overrideCredit,
                overrideNote: null,
              }}
              taskLogs={cell.taskLogs}
              punchSummary={
                cell.checkInAt
                  ? {
                      checkInAt: cell.checkInAt,
                      checkOutAt: cell.checkOutAt,
                      hoursWorked: cell.hoursWorked,
                      dayCredit: cell.dayCredit,
                    }
                  : undefined
              }
              trigger={<CellTile cell={cell} clickable />}
            />
          ) : (
            <CellTile key={cell.date} cell={cell} />
          ),
        )}
      </div>
      {showLegend ? <Legend /> : null}
      <div className="rounded-md bg-muted/30 p-3 text-xs">
        <p>
          <span className="font-medium">Total credits:</span>{" "}
          <span className="tabular-nums">{attendance.actualCredits}</span>{" "}
          / {attendance.expectedCredits} expected
        </p>
      </div>
    </div>
  );
}

function CellTile({
  cell,
  clickable,
}: {
  cell: DayCell;
  clickable?: boolean;
}) {
  const day = Number(cell.date.slice(8));
  const tone = chooseTone(cell);
  return (
    <div
      title={hoverLabel(cell)}
      className={cn(
        "relative flex h-12 w-12 flex-col items-center justify-center rounded-md border text-xs font-medium tabular-nums transition-colors",
        tone,
        clickable ? "cursor-pointer hover:ring-2 hover:ring-foreground/20" : "",
      )}
    >
      <span className="text-[10px] text-muted-foreground/80">{day}</span>
      <span className="font-semibold">
        {cell.isPublicHoliday
          ? "PH"
          : cell.effectiveCredit > 0
            ? cell.effectiveCredit.toFixed(1).replace(/\.0$/, "")
            : cell.isWeekendOff
              ? "·"
              : ""}
      </span>
      {cell.hasPending ? (
        <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
      ) : null}
    </div>
  );
}

function chooseTone(cell: DayCell): string {
  if (cell.hasPending) {
    return "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100";
  }
  if (cell.isPublicHoliday) {
    return "border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-100";
  }
  if (cell.overrideKind === "PAID_LEAVE") {
    return "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/30";
  }
  if (cell.overrideKind === "UNPAID_LEAVE") {
    return "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/30";
  }
  if (cell.overrideKind === "WFH") {
    return "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/30";
  }
  if (cell.effectiveCredit >= 1) {
    return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100";
  }
  if (cell.effectiveCredit >= 0.5) {
    return "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/30";
  }
  if (cell.isWeekendOff) {
    return "border-dashed text-muted-foreground/60";
  }
  // No punches at all on a non-Sunday weekday — could be absent or a
  // weekly off they took on this day. Renders neutral grey.
  return "border-muted text-muted-foreground";
}

function hoverLabel(cell: DayCell): string {
  const parts = [cell.date];
  if (cell.isPublicHoliday)
    parts.push(`Public holiday: ${cell.publicHolidayName}`);
  if (cell.overrideKind) parts.push(`Override: ${cell.overrideKind}`);
  if (cell.hoursWorked != null)
    parts.push(`${cell.hoursWorked}h worked → ${cell.dayCredit} credit`);
  if (cell.hasPending) parts.push("pending owner approval");
  return parts.join(" · ");
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
      <LegendDot tone="border-emerald-300 bg-emerald-50" label="Present" />
      <LegendDot tone="border-yellow-300 bg-yellow-50" label="Half-day" />
      <LegendDot tone="border-amber-400 bg-amber-50" label="Pending" />
      <LegendDot tone="border-sky-400 bg-sky-50" label="Holiday" />
      <LegendDot tone="border-violet-300 bg-violet-50" label="Paid leave" />
      <LegendDot tone="border-rose-300 bg-rose-50" label="Unpaid leave" />
      <LegendDot tone="border-indigo-300 bg-indigo-50" label="WFH" />
      <LegendDot tone="border-dashed" label="Weekly off (assumed)" />
    </div>
  );
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-block h-3 w-3 rounded border align-middle",
          tone,
        )}
      />
      {label}
    </span>
  );
}
