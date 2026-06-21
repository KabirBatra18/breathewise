"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  Check,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  punchAction,
  recordConsentAction,
} from "@/app/(app)/attendance/actions";

/**
 * The employee-side attendance dashboard. Single big Check In or Check
 * Out button (whichever is appropriate for the current state of today's
 * row), with a status card below showing what we know about today.
 *
 * The flow:
 *   1. First-ever visit: consent banner blocks the button until they
 *      accept. One-time per account.
 *   2. Tap Check In → browser geolocation → POST punch.
 *      • Inside office: AUTO_APPROVED, success toast.
 *      • Outside office: a textarea appears asking for the reason
 *        ("Sharma residence install"). On submit → PENDING + OWNER
 *        notified.
 *   3. Today's status card shows: check-in time/status, hours
 *      accumulated so far, and which Button is next.
 *
 * Geolocation specifics:
 *   • Uses navigator.geolocation.getCurrentPosition with
 *     enableHighAccuracy + a 15s timeout. High accuracy uses GPS on
 *     mobile and a mix of GPS/Wi-Fi/IP on desktop.
 *   • Permission is requested on first tap; subsequent taps reuse the
 *     granted permission silently.
 *   • If denied or unavailable, an explanatory error appears with a
 *     "How to enable" link.
 */

type TodayState = {
  checkInAt: string | null;
  checkInStatus: string | null;
  checkInDistanceM: number | null;
  checkInOffsiteNote: string | null;
  checkOutAt: string | null;
  checkOutStatus: string | null;
  checkOutDistanceM: number | null;
  hoursWorked: number | null;
  dayCredit: number | null;
};

export function AttendancePanel({
  consented,
  officeConfigured,
  expectedHoursPerDay,
  officeRadiusM,
  today,
  openPriorShift,
}: {
  consented: boolean;
  officeConfigured: boolean;
  expectedHoursPerDay: number;
  officeRadiusM: number;
  today: TodayState | null;
  openPriorShift: { date: string; checkInAt: string } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<
    "idle" | "locating" | "needs-note" | "denied"
  >("idle");
  const [pendingPunch, setPendingPunch] = useState<{
    kind: "CHECK_IN" | "CHECK_OUT";
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [offsiteNote, setOffsiteNote] = useState("");

  const checkedIn = !!today?.checkInAt;
  const checkedOut = !!today?.checkOutAt;
  const nextKind: "CHECK_IN" | "CHECK_OUT" = !checkedIn
    ? "CHECK_IN"
    : "CHECK_OUT";

  if (!consented) {
    return <ConsentGate />;
  }

  function requestLocationAndPunch(kind: "CHECK_IN" | "CHECK_OUT") {
    if (!("geolocation" in navigator)) {
      toast.error(
        "Your browser doesn't support location capture. Use a recent Chrome / Safari.",
      );
      return;
    }
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        // Quick optimism: compute whether we're inside the office on
        // the client to decide if we need to prompt for an off-site
        // note. We can't compute distance without office coords, so
        // fall back to "needs note" whenever the office isn't
        // configured — matches the server's PENDING-for-unconfigured
        // behaviour.
        attemptPunch(kind, coords);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          // Audit-fix 2026-06-22: switch to a persistent in-card error
          // block with device-specific instructions instead of a single
          // ephemeral toast. Non-technical employees on Android Chrome
          // get a clear "How to enable" path.
          setPhase("denied");
        } else {
          setPhase("idle");
          if (err.code === err.POSITION_UNAVAILABLE) {
            toast.error(
              "Couldn't get your GPS location. Step outside or near a window and try again.",
            );
          } else {
            toast.error("Location request timed out. Try again.");
          }
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  function attemptPunch(
    kind: "CHECK_IN" | "CHECK_OUT",
    coords: { lat: number; lng: number; accuracy: number },
  ) {
    // First attempt without a note. The server returns a "needs note"
    // error when status would be PENDING; we then prompt the user and
    // re-submit with the note attached.
    startTransition(async () => {
      const res = await punchAction({
        kind,
        ...coords,
        clientLocalTime: new Date().toISOString(),
        deviceFingerprint: navigator.userAgent.slice(0, 200),
      });
      if (res.ok) {
        setPhase("idle");
        setPendingPunch(null);
        setOffsiteNote("");
        if (res.status === "AUTO_APPROVED") {
          toast.success(
            kind === "CHECK_IN"
              ? "Checked in at office."
              : "Checked out. Have a good day.",
          );
        } else {
          toast.success(
            kind === "CHECK_IN"
              ? "Checked in at site. Awaiting approval."
              : "Checked out from site. Awaiting approval.",
          );
        }
        return;
      }
      // The server returns a specific error string for "outside the
      // office, please add a note." Detect it and switch the UI to the
      // note-entry phase rather than just bubbling the error.
      if (res.error.includes("add a reason for the off-site")) {
        setPhase("needs-note");
        setPendingPunch({ kind, ...coords });
        return;
      }
      setPhase("idle");
      toast.error(res.error);
    });
  }

  function submitWithNote() {
    if (!pendingPunch) return;
    const note = offsiteNote.trim();
    if (note.length < 3) {
      toast.error("Please add a brief reason (at least 3 characters).");
      return;
    }
    startTransition(async () => {
      const res = await punchAction({
        kind: pendingPunch.kind,
        lat: pendingPunch.lat,
        lng: pendingPunch.lng,
        accuracy: pendingPunch.accuracy,
        offsiteNote: note,
        clientLocalTime: new Date().toISOString(),
        deviceFingerprint: navigator.userAgent.slice(0, 200),
      });
      setPhase("idle");
      setPendingPunch(null);
      setOffsiteNote("");
      if (res.ok) {
        toast.success(
          pendingPunch.kind === "CHECK_IN"
            ? "Checked in at site. Awaiting approval."
            : "Checked out from site. Awaiting approval.",
        );
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Check in when you arrive, check out when you leave. Your GPS
          location is captured at both moments.
        </p>
      </div>

      {!officeConfigured ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Office not yet configured.</p>
          <p className="mt-1">
            Until the owner sets the office location, every punch will need
            manual approval. You can still check in / out normally.
          </p>
        </div>
      ) : null}

      {/* Audit-fix 2026-06-22: surface a previous-day open shift so the
          employee knows they forgot to check out yesterday. Without this,
          the day silently sits with 0 credit and only the OWNER notices
          via the grid. */}
      {openPriorShift ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              You didn&apos;t check out on{" "}
              {formatPriorDate(openPriorShift.date)}.
            </p>
            <p className="mt-1">
              That day will count as 0 credit until your owner fills in
              the time you actually left. Ping them to fix it on{" "}
              <code className="rounded bg-amber-200 px-1 dark:bg-amber-900">
                /attendance/admin
              </code>
              .
            </p>
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-6">
          {/* Main punch button or one of the interstitial states */}
          {phase === "denied" ? (
            <DeniedRecovery
              onTryAgain={() => {
                setPhase("idle");
                // The user has (presumably) just changed permissions in
                // browser settings. The next button tap will re-prompt.
              }}
            />
          ) : phase === "needs-note" ? (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <MapPin className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
                You&apos;re outside the office geofence. Please add a brief
                reason — your owner will see this when approving.
              </div>
              <Textarea
                value={offsiteNote}
                onChange={(e) => setOffsiteNote(e.target.value)}
                placeholder="e.g. Sharma residence — AHU commissioning"
                rows={3}
                autoFocus
              />
              {/* Cancel is intentionally smaller + ghost-styled (was 50/50
                  outline) so it's harder to mistap on mobile. Audit-fix
                  2026-06-22: previously a mistap silently wiped a typed
                  reason; now if a note >5 chars is typed, Cancel prompts
                  for confirmation. The typed note is preserved across
                  the "go back, GPS fix, re-prompt" flow so re-opening
                  this view doesn't lose work. */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      offsiteNote.trim().length > 5 &&
                      !window.confirm(
                        "Discard the reason you typed and go back?",
                      )
                    ) {
                      return;
                    }
                    setPhase("idle");
                    setPendingPunch(null);
                    // Keep offsiteNote in state — if the user re-tries
                    // the punch, the textarea repopulates. This also
                    // covers GPS-retry round-trips.
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={submitWithNote}
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    "Submit punch"
                  )}
                </Button>
              </div>
            </div>
          ) : checkedOut ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="h-6 w-6" />
              </div>
              <p className="font-medium">You&apos;re done for the day</p>
              <p className="text-xs text-muted-foreground">
                See you tomorrow. Today&apos;s hours are below.
              </p>
            </div>
          ) : (
            <Button
              className="h-16 w-full text-base"
              size="lg"
              onClick={() => requestLocationAndPunch(nextKind)}
              disabled={pending || phase === "locating"}
            >
              {phase === "locating" ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Getting your location…
                </>
              ) : nextKind === "CHECK_IN" ? (
                <>
                  <LogIn className="h-5 w-5" />
                  Check in
                </>
              ) : (
                <>
                  <LogOut className="h-5 w-5" />
                  Check out
                </>
              )}
            </Button>
          )}
          {/* Audit-fix 2026-06-22: in-button hint sets expectation BEFORE
              the OS permission dialog appears, replacing the "browser
              suddenly asks for location with no context" first-time-user
              surprise. Stays visible at all times so it's not a
              one-time dismissable banner. */}
          {phase === "idle" && !checkedOut ? (
            <p className="text-center text-[11px] text-muted-foreground">
              Tapping {nextKind === "CHECK_IN" ? "Check in" : "Check out"} will
              ask your browser for location access — tap{" "}
              <strong>Allow</strong> when prompted.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Today's status */}
      {today ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <CardDescription className="text-xs">
              {formatToday()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusRow
              label="Checked in"
              time={today.checkInAt}
              status={today.checkInStatus}
              distanceM={today.checkInDistanceM}
              note={today.checkInOffsiteNote}
            />
            <StatusRow
              label="Checked out"
              time={today.checkOutAt}
              status={today.checkOutStatus}
              distanceM={today.checkOutDistanceM}
              note={null}
            />
            {today.hoursWorked != null ? (
              <div className="flex items-baseline justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  Hours worked today
                </span>
                <div className="text-right">
                  <span className="text-lg font-semibold tabular-nums">
                    {today.hoursWorked.toFixed(2)}h
                  </span>
                  {today.dayCredit != null ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium">
                      {today.dayCredit} {today.dayCredit === 1 ? "credit" : "credits"}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : checkedIn ? (
              <p className="text-xs text-muted-foreground">
                Expected to complete <strong>{expectedHoursPerDay}h</strong>{" "}
                for a full day.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-center text-[11px] text-muted-foreground">
        Geofence: {officeRadiusM}m radius · GPS location captured at every
        punch · all activity logged.
      </p>
    </div>
  );
}

function StatusRow({
  label,
  time,
  status,
  distanceM,
  note,
}: {
  label: string;
  time: string | null;
  status: string | null;
  distanceM: number | null;
  note: string | null;
}) {
  if (!time)
    return (
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>—</span>
      </div>
    );
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{formatTime(time)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        {status === "AUTO_APPROVED" ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <Building2 className="h-3 w-3" /> at office
          </span>
        ) : status === "PENDING" ? (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
            <MapPin className="h-3 w-3" /> off-site
            {distanceM != null ? ` · ${distanceM}m away` : ""} · awaiting
            approval
          </span>
        ) : status === "OWNER_APPROVED" ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <Check className="h-3 w-3" /> approved
          </span>
        ) : status === "OWNER_REJECTED" ? (
          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
            ✕ rejected
          </span>
        ) : null}
      </div>
      {note ? (
        <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function ConsentGate() {
  const [pending, startTransition] = useTransition();
  function accept() {
    startTransition(async () => {
      const res = await recordConsentAction();
      if (!res.ok) toast.error(res.error);
      // Server action revalidates; the page re-renders without the gate.
    });
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Location capture consent</CardTitle>
        </div>
        <CardDescription>
          Required before you can use attendance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Each time you check in or check out, this app captures your
          GPS location (latitude, longitude, accuracy radius).
        </p>
        <ul className="ml-5 list-disc space-y-1 text-xs text-muted-foreground">
          <li>
            Used to verify you were at the office or to flag off-site
            punches for owner approval.
          </li>
          <li>
            Raw coordinates are automatically purged after 90 days. After
            that, only the distance-from-office reading is kept.
          </li>
          <li>
            All activity is logged in an audit trail; the owner can
            review it at any time.
          </li>
          <li>You can stop using attendance at any time.</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          By tapping &ldquo;I agree&rdquo;, you consent to this location
          capture under India&apos;s Digital Personal Data Protection Act
          (DPDP), 2023.
        </p>
        <Button onClick={accept} disabled={pending} className="w-full">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "I agree — enable attendance"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function formatToday(): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function formatPriorDate(yyyymmdd: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${yyyymmdd}T00:00:00+05:30`));
}

/**
 * Persistent in-card recovery block when geolocation permission has
 * been denied. Audit-fix 2026-06-22: previously the denial just
 * raised a one-line toast which non-technical employees couldn't act
 * on. Now we surface platform-specific instructions inline + a
 * "Try again" button.
 *
 * isIOS / isAndroid sniffing is intentionally light — we only need
 * to pick one of two instruction blocks. Edge cases (Firefox,
 * Samsung Internet) get the Android block which is the closest
 * functional match.
 */
function DeniedRecovery({ onTryAgain }: { onTryAgain: () => void }) {
  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100">
        <p className="flex items-center gap-1.5 font-medium">
          <Shield className="h-3.5 w-3.5" />
          Location access denied
        </p>
        <p className="mt-1.5">
          To check in, your browser needs permission to share your
          location. Here&apos;s how:
        </p>
        {isIOS ? (
          <ol className="ml-4 mt-2 list-decimal space-y-1">
            <li>Open <strong>Settings</strong> on your iPhone</li>
            <li>Scroll to <strong>Safari</strong></li>
            <li>Tap <strong>Location</strong></li>
            <li>
              Choose <strong>While Using the App</strong> (or{" "}
              <strong>Ask</strong>)
            </li>
            <li>Come back here and tap <strong>Try again</strong></li>
          </ol>
        ) : (
          <ol className="ml-4 mt-2 list-decimal space-y-1">
            <li>
              Tap the <strong>padlock icon</strong> (or info icon) next to{" "}
              <code className="rounded bg-rose-200/60 px-1 dark:bg-rose-900/60">
                hub.breathe-wise.in
              </code>{" "}
              in your browser&apos;s address bar
            </li>
            <li>
              Tap <strong>Permissions</strong>, then <strong>Location</strong>
            </li>
            <li>
              Change from <strong>Block</strong> to <strong>Allow</strong> (or{" "}
              <strong>Ask</strong>)
            </li>
            <li>Come back here and tap <strong>Try again</strong></li>
          </ol>
        )}
      </div>
      <Button className="w-full" onClick={onTryAgain}>
        Try again
      </Button>
    </div>
  );
}
