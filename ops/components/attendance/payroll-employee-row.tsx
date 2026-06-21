"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
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
import { savePayrollSettingsAction } from "@/app/(app)/payroll/actions";

export function PayrollEmployeeRow({
  employee,
  month,
}: {
  employee: {
    userId: string;
    fullName: string;
    username: string;
    monthlySalary: number;
    joinedOn: string | null;
    isActive: boolean;
  };
  month: {
    yearMonth: string;
    actualCredits: number;
    expectedCredits: number;
    computedSalary: number;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    formData.set("userId", employee.userId);
    startTransition(async () => {
      const res = await savePayrollSettingsAction(formData);
      if (res.ok) toast.success(`${employee.fullName} payroll saved.`);
      else toast.error(res.error);
    });
  }

  const ratio =
    month.expectedCredits > 0
      ? month.actualCredits / month.expectedCredits
      : 0;
  const isUnderpaid = employee.monthlySalary === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
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
            <CardDescription>
              Monthly base ₹
              {formatMoney(employee.monthlySalary)} · {month.actualCredits}{" "}
              of {month.expectedCredits} credits ({(ratio * 100).toFixed(1)}
              %)
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              This month
            </p>
            <p className="text-xl font-semibold tabular-nums">
              ₹{formatMoney(month.computedSalary)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isUnderpaid ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            Monthly salary is ₹0 — payroll won&apos;t compute anything until
            you set this below.
          </div>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((o) => !o)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> Hide salary settings
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> Edit salary settings
            </>
          )}
        </button>
        {expanded ? (
          <form
            action={save}
            className="grid gap-3 rounded-md border bg-muted/30 p-3 md:grid-cols-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`ms-${employee.userId}`}>
                Monthly salary (₹)
              </Label>
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
              <Label htmlFor={`jo-${employee.userId}`}>Joined on</Label>
              <Input
                id={`jo-${employee.userId}`}
                name="joinedOn"
                type="date"
                defaultValue={employee.joinedOn ?? ""}
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
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
