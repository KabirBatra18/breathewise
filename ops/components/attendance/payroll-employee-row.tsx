"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  markPayrollPaidAction,
  savePayrollSettingsAction,
} from "@/app/(app)/payroll/actions";

interface Cycle {
  start: string;
  end: string;
  payDate: string;
  actualCredits: number;
  expectedCredits: number;
  computedSalary: number;
}

type PreviousCycle = Cycle & { alreadyPaid: boolean };
type CurrentCycle = Cycle & { isComplete: boolean };

export function PayrollEmployeeRow(
  props:
    | {
        employee: {
          userId: string;
          fullName: string;
          username: string;
          monthlySalary: number;
          joinedOn: string | null;
          isActive: boolean;
        };
        cycleMode: "unconfigured";
      }
    | {
        employee: {
          userId: string;
          fullName: string;
          username: string;
          monthlySalary: number;
          joinedOn: string;
          isActive: boolean;
        };
        cycleMode: "configured";
        current: CurrentCycle;
        previous: PreviousCycle | null;
      },
) {
  const { employee } = props;
  const [showSettings, setShowSettings] = useState(props.cycleMode === "unconfigured");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {employee.fullName}
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {employee.username}
              </span>
              {!employee.isActive ? (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Payroll paused
                </span>
              ) : null}
            </CardTitle>
            {props.cycleMode === "configured" ? (
              <CardDescription>
                Pay date: <strong>{formatDay(props.current.payDate)}</strong>{" "}
                · base ₹{formatMoney(employee.monthlySalary)}
              </CardDescription>
            ) : (
              <CardDescription className="text-amber-700 dark:text-amber-400">
                Not configured — set monthly salary + joined_on below.
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {props.cycleMode === "configured" ? (
          <>
            {props.previous && !props.previous.alreadyPaid ? (
              <PreviousCycleCard
                employeeUserId={employee.userId}
                employeeName={employee.fullName}
                monthlySalary={employee.monthlySalary}
                previous={props.previous}
              />
            ) : null}
            {props.previous?.alreadyPaid ? (
              <div className="rounded-md border bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                ✓ Last cycle (
                {formatDay(props.previous.start)} →{" "}
                {formatDay(props.previous.end)}) already paid.
              </div>
            ) : null}
            <CurrentCycleCard current={props.current} />
          </>
        ) : null}

        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowSettings((o) => !o)}
        >
          {showSettings ? (
            <>
              <ChevronUp className="h-3 w-3" /> Hide salary settings
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Edit salary settings
            </>
          )}
        </button>
        {showSettings ? (
          <PayrollSettingsForm employee={employee} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function PreviousCycleCard({
  employeeUserId,
  employeeName,
  monthlySalary,
  previous,
}: {
  employeeUserId: string;
  employeeName: string;
  monthlySalary: number;
  previous: PreviousCycle;
}) {
  const [pending, startTransition] = useTransition();
  const [paidAmount, setPaidAmount] = useState(previous.computedSalary.toFixed(2));
  const [notes, setNotes] = useState("");

  function markPaid() {
    const amt = Number(paidAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error("Paid amount must be a non-negative number.");
      return;
    }
    const fd = new FormData();
    fd.set("userId", employeeUserId);
    fd.set("payDate", previous.payDate);
    fd.set("periodStart", previous.start);
    fd.set("periodEnd", previous.end);
    fd.set("expectedCredits", String(previous.expectedCredits));
    fd.set("actualCredits", String(previous.actualCredits));
    fd.set("monthlySalary", String(monthlySalary));
    fd.set("computedAmount", String(previous.computedSalary));
    fd.set("paidAmount", String(amt));
    if (notes.trim()) fd.set("notes", notes.trim());
    startTransition(async () => {
      const res = await markPayrollPaidAction(fd);
      if (res.ok) toast.success(`${employeeName}: cycle marked paid.`);
      else toast.error(res.error);
    });
  }

  function exportCsv() {
    const rows = [
      ["Field", "Value"],
      ["Employee", employeeName],
      ["Period start", previous.start],
      ["Period end", previous.end],
      ["Pay date", previous.payDate],
      ["Expected credits", String(previous.expectedCredits)],
      ["Actual credits", String(previous.actualCredits)],
      ["Monthly base", String(monthlySalary)],
      ["Computed amount", String(previous.computedSalary.toFixed(2))],
      ["Paid amount (to be filled)", paidAmount],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${employeeName.replace(/\s+/g, "-")}-${previous.payDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border border-emerald-400 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Ready to pay
          </p>
          <p className="mt-0.5 font-medium">
            {formatDay(previous.start)} → {formatDay(previous.end)}
          </p>
          <p className="text-xs text-muted-foreground">
            {previous.actualCredits} of {previous.expectedCredits} credits
            delivered
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Computed
          </p>
          <p className="text-xl font-semibold tabular-nums">
            ₹{formatMoney(previous.computedSalary)}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[11px]">Paid amount (₹)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Defaults to computed. Override if you rounded up or added a bonus.
          </p>
        </div>
        <div>
          <Label className="text-[11px]">Note (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Diwali bonus included"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={pending}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
        <Button size="sm" onClick={markPaid} disabled={pending}>
          <Check className="h-3.5 w-3.5" />
          {pending ? "Saving…" : "Mark as paid"}
        </Button>
      </div>
    </div>
  );
}

function CurrentCycleCard({
  current,
}: {
  current: CurrentCycle;
}) {
  const daysUntilPay = (() => {
    const today = new Date();
    const payDate = new Date(`${current.payDate}T23:59:59+05:30`);
    const ms = payDate.getTime() - today.getTime();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  })();

  return (
    <div className="rounded-md border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            In progress
          </p>
          <p className="mt-0.5 font-medium">
            {formatDay(current.start)} → {formatDay(current.end)}
          </p>
          <p className="text-xs text-muted-foreground">
            {current.actualCredits} of {current.expectedCredits} credits ·{" "}
            {daysUntilPay > 0
              ? `pay date in ${daysUntilPay} day${daysUntilPay === 1 ? "" : "s"}`
              : "pay date today"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Projected
          </p>
          <p className="text-base font-semibold tabular-nums">
            ₹{formatMoney(current.computedSalary)}
          </p>
        </div>
      </div>
    </div>
  );
}

function PayrollSettingsForm({
  employee,
}: {
  employee: {
    userId: string;
    fullName: string;
    username: string;
    monthlySalary: number;
    joinedOn: string | null;
    isActive: boolean;
  };
}) {
  const [pending, startTransition] = useTransition();
  function save(formData: FormData) {
    formData.set("userId", employee.userId);
    startTransition(async () => {
      const res = await savePayrollSettingsAction(formData);
      if (res.ok) toast.success(`${employee.fullName} payroll saved.`);
      else toast.error(res.error);
    });
  }
  return (
    <form
      action={save}
      className="grid gap-3 rounded-md border bg-muted/30 p-3 md:grid-cols-2"
    >
      <div className="space-y-1.5">
        <Label htmlFor={`ms-${employee.userId}`}>Monthly salary (₹)</Label>
        <Input
          id={`ms-${employee.userId}`}
          name="monthlySalary"
          type="number"
          step="0.01"
          min={0}
          defaultValue={employee.monthlySalary}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`jo-${employee.userId}`}>
          Joined on
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            (the day-of-month sets their pay date forever)
          </span>
        </Label>
        <Input
          id={`jo-${employee.userId}`}
          name="joinedOn"
          type="date"
          defaultValue={employee.joinedOn ?? ""}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={employee.isActive}
          className="h-4 w-4 rounded border-input"
        />
        Active on payroll (uncheck to pause salary calculation)
      </label>
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${iso}T00:00:00+05:30`));
}
