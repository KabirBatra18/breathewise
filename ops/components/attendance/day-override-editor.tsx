"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  clearDayOverrideAction,
  setDayOverrideAction,
} from "@/app/(app)/attendance/admin/actions";

/**
 * Click-to-edit per-day modal. Surfaces on every cell in the
 * /attendance/admin/grid view. Lets OWNER mark a day as leave / WFH /
 * holiday / manually fix it, especially for the BACKFILL workflow
 * (employees worked Jun 1-21 before the system started tracking).
 *
 * Mode:
 *   • If the day has no row yet → "Add override" (creates the row +
 *     sets the override fields atomically in the action)
 *   • If a row exists → "Edit override" + "Clear override" if one
 *     is already set
 */
const OVERRIDE_KINDS: Array<{
  value: "PAID_LEAVE" | "UNPAID_LEAVE" | "WFH" | "PUBLIC_HOLIDAY";
  label: string;
  defaultCredit: number;
  description: string;
}> = [
  {
    value: "PAID_LEAVE",
    label: "Paid leave",
    defaultCredit: 1.0,
    description: "Counts as a full credit toward salary",
  },
  {
    value: "UNPAID_LEAVE",
    label: "Unpaid leave",
    defaultCredit: 0,
    description: "Counts as 0 — no salary for this day",
  },
  {
    value: "WFH",
    label: "Work from home",
    defaultCredit: 1.0,
    description: "Counts as full credit; no punch needed",
  },
  {
    value: "PUBLIC_HOLIDAY",
    label: "Public holiday (this person only)",
    defaultCredit: 1.0,
    description: "Use /holidays page if it's a holiday for everyone",
  },
];

export function DayOverrideEditor({
  trigger,
  userId,
  date,
  existing,
}: {
  trigger?: React.ReactNode;
  userId: string;
  date: string; // YYYY-MM-DD
  existing: {
    dayId: string | null;
    overrideKind: string | null;
    overrideCredit: number | null;
    overrideNote: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<typeof OVERRIDE_KINDS[number]["value"]>(
    (existing.overrideKind as typeof OVERRIDE_KINDS[number]["value"]) ??
      "PAID_LEAVE",
  );
  const selectedKind = OVERRIDE_KINDS.find((k) => k.value === kind)!;
  const [credit, setCredit] = useState<string>(
    existing.overrideCredit != null
      ? String(existing.overrideCredit)
      : String(selectedKind.defaultCredit),
  );
  const [note, setNote] = useState(existing.overrideNote ?? "");

  function save() {
    const creditNum = Number(credit);
    if (!Number.isFinite(creditNum) || creditNum < 0) {
      toast.error("Credit must be a non-negative number.");
      return;
    }
    startTransition(async () => {
      const res = await setDayOverrideAction({
        userId,
        date,
        dayId: existing.dayId ?? undefined,
        kind,
        credit: creditNum,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        toast.success(`${formatDay(date)} marked as ${selectedKind.label}.`);
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  function clear() {
    if (!existing.dayId) return;
    const fd = new FormData();
    fd.set("dayId", existing.dayId);
    startTransition(async () => {
      const res = await clearDayOverrideAction(fd);
      if (res.ok) {
        toast.success(`Cleared override on ${formatDay(date)}.`);
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block h-full w-full cursor-pointer text-inherit"
      >
        {trigger}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Pencil className="-mt-0.5 mr-1 inline h-4 w-4" />
              Override day · {formatDay(date)}
            </DialogTitle>
            <DialogDescription>
              {existing.overrideKind ? (
                <>
                  Currently marked as{" "}
                  <strong>
                    {OVERRIDE_KINDS.find(
                      (k) => k.value === existing.overrideKind,
                    )?.label ?? existing.overrideKind}
                  </strong>
                  {existing.overrideCredit != null
                    ? ` · ${existing.overrideCredit} credit`
                    : ""}
                  . Change or clear below.
                </>
              ) : (
                <>
                  Mark this day with a leave / WFH / holiday override.
                  Used for backfilling days that pre-date the attendance
                  system, or for correcting a missed punch.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  const next = v as typeof kind;
                  setKind(next);
                  const k = OVERRIDE_KINDS.find((x) => x.value === next);
                  if (k) setCredit(String(k.defaultCredit));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERRIDE_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedKind.description}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit">Credit</Label>
              <Input
                id="credit"
                type="number"
                step="0.5"
                min={0}
                max={3}
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                0.5 = half-day · 1.0 = full day · &gt; 1.0 = overtime
                (rare for a leave override).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Personal leave / Doctor's appointment"
              />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <div>
              {existing.overrideKind ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clear}
                  disabled={pending}
                  className="text-rose-700 hover:bg-rose-50"
                >
                  Clear override
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save override"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${iso}T00:00:00+05:30`));
}
