"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, MapPin, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveDayPunchAction,
  rejectDayPunchAction,
} from "@/app/(app)/attendance/admin/actions";

type Punch = {
  at: string;
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  accuracyM: number | null;
  status: string | null;
  note: string | null;
};

export function PendingApprovalCard({
  dayId,
  employeeName,
  date,
  checkIn,
  checkOut,
}: {
  dayId: string;
  employeeName: string;
  date: string;
  checkIn: Punch | null;
  checkOut: Punch | null;
}) {
  const [pending, startTransition] = useTransition();
  const [mapOpen, setMapOpen] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  // Decide what's pending — could be check-in only, check-out only, or
  // both. The Approve / Reject buttons act on whatever's PENDING.
  const checkInPending = checkIn?.status === "PENDING";
  const checkOutPending = checkOut?.status === "PENDING";
  const scope: "CHECK_IN" | "CHECK_OUT" | "BOTH" =
    checkInPending && checkOutPending
      ? "BOTH"
      : checkInPending
        ? "CHECK_IN"
        : "CHECK_OUT";

  const focal = checkInPending ? checkIn : checkOut;
  if (!focal) return null;

  function approve() {
    startTransition(async () => {
      const res = await approveDayPunchAction({ dayId, scope });
      if (res.ok) toast.success(`Approved ${employeeName}'s punch.`);
      else toast.error(res.error);
    });
  }
  function reject() {
    const note = rejectNote.trim();
    if (note.length < 3) {
      toast.error("Add a brief reason for the rejection.");
      return;
    }
    startTransition(async () => {
      const res = await rejectDayPunchAction({ dayId, scope, note });
      if (res.ok) toast.success(`Rejected.`);
      else toast.error(res.error);
      setRejectMode(false);
      setRejectNote("");
    });
  }

  // OpenStreetMap embed URL — no API key required. Constructs a small
  // bbox around the punched coordinates so the marker is visible.
  const mapEmbed =
    focal.lat != null && focal.lng != null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${
          focal.lng - 0.005
        }%2C${focal.lat - 0.003}%2C${focal.lng + 0.005}%2C${
          focal.lat + 0.003
        }&layer=mapnik&marker=${focal.lat}%2C${focal.lng}`
      : null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{employeeName}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(date)} ·{" "}
            {scope === "BOTH"
              ? "both punches off-site"
              : scope === "CHECK_IN"
                ? "checked in off-site"
                : "checked out off-site"}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <MapPin className="h-3 w-3" />
          {focal.distanceM != null ? `${focal.distanceM}m away` : "off-site"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {checkIn ? (
          <PunchSummary label="Checked in" punch={checkIn} />
        ) : null}
        {checkOut ? (
          <PunchSummary label="Checked out" punch={checkOut} />
        ) : null}
      </div>

      {focal.note ? (
        <div className="mt-3 rounded-md bg-muted/50 p-2 text-xs">
          <span className="font-medium">Reason:</span> {focal.note}
        </div>
      ) : null}

      {mapEmbed ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setMapOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {mapOpen ? (
              <>
                <ChevronUp className="h-3 w-3" /> Hide map
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Show map
              </>
            )}
          </button>
          {mapOpen ? (
            <iframe
              src={mapEmbed}
              className="mt-2 aspect-video w-full rounded-md border"
              loading="lazy"
              title={`Map of ${employeeName}'s punch location`}
            />
          ) : null}
        </div>
      ) : null}

      {rejectMode ? (
        <div className="mt-3 space-y-2 rounded-md border border-rose-300 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder={`Why are you rejecting this? (e.g. "Not authorized for site visit")`}
            rows={2}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setRejectMode(false);
                setRejectNote("");
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={reject}
              disabled={pending}
            >
              {pending ? "Rejecting…" : "Confirm reject"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => setRejectMode(true)}
            disabled={pending}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={approve}
            disabled={pending}
          >
            <Check className="h-3.5 w-3.5" />
            {pending ? "Approving…" : "Approve"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PunchSummary({ label, punch }: { label: string; punch: Punch }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">
        {formatTime(punch.at)}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {punch.distanceM != null
          ? `${punch.distanceM}m from office`
          : "distance unknown"}
        {punch.accuracyM != null ? ` · ±${punch.accuracyM}m GPS` : ""}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso + "T00:00:00"));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
