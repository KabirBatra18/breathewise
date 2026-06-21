"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveOvertimeAction } from "@/app/(app)/attendance/admin/actions";

export function OvertimeApprovalCard({
  dayId,
  employeeName,
  date,
  hoursWorked,
  rawDayCredit,
  cappedCredit,
  checkInAt,
  checkOutAt,
}: {
  dayId: string;
  employeeName: string;
  date: string;
  hoursWorked: number;
  rawDayCredit: number;
  cappedCredit: number;
  checkInAt: string | null;
  checkOutAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  function approve() {
    startTransition(async () => {
      const res = await approveOvertimeAction({
        dayId,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        toast.success(
          `Approved ${employeeName}'s ${rawDayCredit} credit day.`,
        );
        setShowNote(false);
        setNote("");
      } else {
        toast.error(res.error);
      }
    });
  }

  function deny() {
    // No DB action needed — the cap stays at 1.0 by default. "Deny" is
    // effectively dismissing the card from the queue. We could add a
    // formal "denied" state if OWNER wants pattern-detection later;
    // for now this is a visual dismiss.
    toast.success(
      `Left at ${cappedCredit.toFixed(1)} credit — overtime not paid.`,
    );
  }

  const extraCredits = rawDayCredit - cappedCredit;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{employeeName}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(date)} ·{" "}
            {checkInAt && checkOutAt ? (
              <>
                {formatTime(checkInAt)} → {formatTime(checkOutAt)}
              </>
            ) : (
              "incomplete shift"
            )}{" "}
            · {hoursWorked.toFixed(2)}h worked
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Currently
          </p>
          <p className="text-sm tabular-nums">
            <span className="font-semibold">{cappedCredit.toFixed(1)}</span>{" "}
            <span className="text-muted-foreground">
              / {rawDayCredit.toFixed(1)} earned
            </span>
          </p>
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            +{extraCredits.toFixed(1)} pending
          </p>
        </div>
      </div>

      {showNote ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional: reason (e.g. 'Sharma project final commissioning, agreed double shift')"
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowNote(false);
                setNote("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={approve}
              disabled={pending}
            >
              <Check className="h-3.5 w-3.5" />
              {pending ? "Approving…" : `Pay ${rawDayCredit.toFixed(1)} credits`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={deny}
            disabled={pending}
          >
            <X className="h-3.5 w-3.5" />
            Don&apos;t pay overtime
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => setShowNote(true)}
            disabled={pending}
          >
            <Check className="h-3.5 w-3.5" />
            Approve overtime
          </Button>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${iso}T00:00:00+05:30`));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
