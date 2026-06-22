"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowUp, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveTaskLogAction } from "@/app/(app)/attendance/task-log-actions";
import { hourlyBuckets } from "@/lib/attendance/task-buckets";

/**
 * The hourly-row task-log entry form. Optimised for speed:
 *
 *   • Hours pre-computed from check-in/check-out timestamps
 *   • Each row is a single text input — no chip pickers, no category
 *     dropdown (kept off the table per Kabir's 2026-06-22 ask)
 *   • "Same as above" button on each row except the first; one tap
 *     copies the prior row's text. Handles the common "did one thing
 *     for 3 hours" case in two extra taps total.
 *   • Persists to localStorage on every keystroke. Browser back / refresh
 *     / accidental navigation never loses text. Cleared on successful save.
 *
 * Save semantics: replace-all. Whatever the rows say at save time
 * becomes the canonical log for the day, replacing any prior version.
 */

const LOCAL_KEY = (dayId: string) => `uths-attendance-task-log:${dayId}`;

export function TaskLogForm({
  dayId,
  dateLabel,
  checkInAt,
  checkOutAt,
  initial,
  recentDescriptions,
  onSaved,
  onSkip,
  showSkip = true,
}: {
  dayId: string;
  // Human-friendly date label e.g. "Today" or "Sat, 21 Jun"
  dateLabel: string;
  checkInAt: string; // ISO
  checkOutAt: string; // ISO
  initial?: Array<{ hourStart: string; hourEnd: string; description: string }>;
  // Phase 2 (2026-06-22) — last 14 days of this user's own descriptions.
  // Wired into a <datalist> on each row's input. Typing 2-3 chars
  // surfaces matches; tap a suggestion to refill. Empty array = no
  // suggestions (new employee, first cycle).
  recentDescriptions?: string[];
  onSaved?: () => void;
  onSkip?: () => void;
  showSkip?: boolean;
}) {
  const buckets = useMemo(
    () => hourlyBuckets(new Date(checkInAt), new Date(checkOutAt)),
    [checkInAt, checkOutAt],
  );

  // Row state — initialised from saved server data + any localStorage
  // draft (drafts win over server when both exist; localStorage is
  // cleared on successful save).
  const [rows, setRows] = useState<string[]>(() => {
    const fromServer = buckets.map(
      (b) =>
        initial?.find((i) => i.hourStart === b.startIso)?.description ?? "",
    );
    if (typeof window === "undefined") return fromServer;
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY(dayId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === buckets.length) {
          return parsed.map((v: unknown) => (typeof v === "string" ? v : ""));
        }
      }
    } catch {
      /* localStorage unavailable — fall through */
    }
    return fromServer;
  });

  const [pending, startTransition] = useTransition();

  // Persist on every change. Debounce isn't critical at this volume
  // (a few keystrokes per row), and a synchronous write is fine.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCAL_KEY(dayId), JSON.stringify(rows));
    } catch {
      /* quota exceeded — silent */
    }
  }, [rows, dayId]);

  function update(idx: number, value: string) {
    setRows((curr) => curr.map((v, i) => (i === idx ? value : v)));
  }

  function sameAsAbove(idx: number) {
    if (idx === 0) return;
    setRows((curr) =>
      curr.map((v, i) => (i === idx ? curr[idx - 1] : v)),
    );
  }

  function save() {
    const emptyCount = rows.filter((r) => !r.trim()).length;
    if (emptyCount === rows.length) {
      toast.error(
        "Please describe at least one hour. Even \"break\" or \"office\" is fine.",
      );
      return;
    }
    if (emptyCount > 0) {
      const proceed = window.confirm(
        `${emptyCount} of ${rows.length} hours are blank. Save anyway?`,
      );
      if (!proceed) return;
    }
    startTransition(async () => {
      const res = await saveTaskLogAction({
        dayId,
        buckets: buckets.map((b, i) => ({
          hourStart: b.startIso,
          hourEnd: b.endIso,
          description: rows[i] ?? "",
        })),
      });
      if (res.ok) {
        toast.success(`Tasks logged for ${dateLabel}.`);
        try {
          window.localStorage.removeItem(LOCAL_KEY(dayId));
        } catch {
          /* ignore */
        }
        onSaved?.();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (buckets.length === 0) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
        This day has no check-in/check-out range. Contact your owner to
        fix it on /attendance/admin.
      </div>
    );
  }

  const datalistId = `task-suggestions-${dayId}`;

  return (
    <div className="space-y-4">
      {/* Autocomplete source — last 14 days of this user's own task
          descriptions. Native <datalist> means: zero JS, mobile keyboards
          surface suggestions as a dropdown, tap to refill. */}
      {recentDescriptions && recentDescriptions.length > 0 ? (
        <datalist id={datalistId}>
          {recentDescriptions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      ) : null}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Log your day · {dateLabel}
        </h2>
        <p className="text-xs text-muted-foreground">
          One line per hour. Tap the microphone on your keyboard to speak
          instead of type
          {recentDescriptions && recentDescriptions.length > 0
            ? "; tap an input to see recent entries as suggestions."
            : "."}
        </p>
      </div>

      <div className="space-y-2">
        {buckets.map((b, idx) => (
          <div
            key={b.startIso}
            className="space-y-1 rounded-md border bg-card p-3"
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="font-medium">
                {b.label}
                <span className="ml-2 text-muted-foreground/70">
                  ({b.minutes}m)
                </span>
              </span>
              {idx > 0 ? (
                <button
                  type="button"
                  onClick={() => sameAsAbove(idx)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-foreground/80 hover:bg-muted hover:text-foreground"
                >
                  <ArrowUp className="h-3 w-3" />
                  Same as above
                </button>
              ) : null}
            </div>
            <Input
              value={rows[idx]}
              onChange={(e) => update(idx, e.target.value)}
              placeholder={
                idx === 0
                  ? "What did you do this hour…"
                  : "…"
              }
              inputMode="text"
              autoComplete="off"
              list={
                recentDescriptions && recentDescriptions.length > 0
                  ? datalistId
                  : undefined
              }
              className="h-10"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {showSkip ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSkip?.()}
            disabled={pending}
          >
            Skip for now
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          onClick={save}
          disabled={pending}
          className="sm:min-w-[160px]"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Save log
            </>
          )}
        </Button>
      </div>
      {showSkip ? (
        <p className="text-center text-[10px] text-muted-foreground">
          Skip is fine for now, but you&apos;ll be asked to fill it
          before you can check in tomorrow.
        </p>
      ) : null}
    </div>
  );
}
