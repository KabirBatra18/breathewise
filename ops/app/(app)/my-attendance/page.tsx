import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAuth } from "@/lib/auth/server";
import { loadMonthlyAttendance } from "@/lib/attendance/queries";
import { istDateString } from "@/lib/attendance/ist-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthlyGrid } from "@/components/attendance/monthly-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "My attendance" };

export default async function MyAttendancePage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const me = await requireAuth();
  const yearMonth = normalizeYearMonth(searchParams.m);

  const attendance = await loadMonthlyAttendance(me.id, yearMonth);

  // Prev / next month link generation. We don't restrict by employee
  // join date here — they can browse arbitrary months; empty months
  // just show all-grey cells.
  const { prev, next } = adjacentMonths(yearMonth);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          My attendance
        </h1>
        <p className="text-sm text-muted-foreground">
          Your monthly credit summary + day-by-day breakdown.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{formatYearMonth(yearMonth)}</CardTitle>
            <CardDescription>
              {attendance.actualCredits} of {attendance.expectedCredits}{" "}
              expected credits delivered
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              render={<Link href={`/my-attendance?m=${prev}`} />}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              render={<Link href={`/my-attendance?m=${next}`} />}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <MonthlyGrid attendance={attendance} />
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeYearMonth(input?: string): string {
  if (input && /^\d{4}-\d{2}$/.test(input)) {
    const [y, m] = input.split("-").map(Number);
    if (m >= 1 && m <= 12 && y >= 2020 && y <= 2100) return input;
  }
  return istDateString().slice(0, 7);
}

function adjacentMonths(yearMonth: string): { prev: string; next: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const prev =
    m === 1
      ? `${y - 1}-12`
      : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next =
    m === 12
      ? `${y + 1}-01`
      : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { prev, next };
}

function formatYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
