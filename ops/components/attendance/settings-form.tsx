"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, MapPin, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveAttendanceSettingsAction } from "@/app/(app)/settings/attendance/actions";

interface InitialSettings {
  officeLatitude: number | null;
  officeLongitude: number | null;
  officeRadiusMeters: number;
  accuracyRejectThresholdM: number;
  expectedHoursPerDay: number;
  weeklyOffsPerWeek: number;
  paidLeavesPerMonth: number;
  trustedOfficeIps: string[];
}

export function AttendanceSettingsForm({
  initial,
}: {
  initial: InitialSettings;
}) {
  const [pending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [lat, setLat] = useState<string>(
    initial.officeLatitude != null ? String(initial.officeLatitude) : "",
  );
  const [lng, setLng] = useState<string>(
    initial.officeLongitude != null ? String(initial.officeLongitude) : "",
  );
  // Trusted office IPs state. Stored as a newline-separated string in
  // the form (one IP per line) so OWNER can edit freely. Validated +
  // normalised on the server in saveAttendanceSettingsAction.
  const [trustedIps, setTrustedIps] = useState<string>(
    initial.trustedOfficeIps.join("\n"),
  );
  const [detectingIp, setDetectingIp] = useState(false);

  async function detectCurrentIp() {
    setDetectingIp(true);
    try {
      // Public IP echo from a free zero-auth endpoint. Several
      // alternatives if this becomes unreliable: api.ipify.org,
      // icanhazip.com, ipinfo.io. We use ifconfig.me as a primary
      // because it's stable and CORS-friendly.
      const r = await fetch("https://api.ipify.org?format=json");
      if (!r.ok) throw new Error("ipify failed");
      const j = await r.json();
      const ip = (j.ip as string).trim();
      if (!ip) throw new Error("no ip in response");
      // Add to list if not already present.
      const lines = trustedIps
        .split(/[\s,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!lines.includes(ip)) lines.push(ip);
      setTrustedIps(lines.join("\n"));
      toast.success(`Added ${ip} to trusted office IPs.`);
    } catch {
      toast.error(
        "Couldn't detect your IP. Type it manually — find it at whatismyipaddress.com",
      );
    } finally {
      setDetectingIp(false);
    }
  }

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Browser doesn't support location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
        setLocating(false);
        toast.success(
          `Captured your current location (±${Math.round(pos.coords.accuracy)}m).`,
        );
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : "Couldn't capture location. Try again outside.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const mapEmbed =
    lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${
          Number(lng) - 0.005
        }%2C${Number(lat) - 0.003}%2C${Number(lng) + 0.005}%2C${
          Number(lat) + 0.003
        }&layer=mapnik&marker=${Number(lat)}%2C${Number(lng)}`
      : null;

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await saveAttendanceSettingsAction(formData);
      if (res.ok) {
        toast.success("Attendance settings saved.");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="officeLatitude">Latitude</Label>
          <Input
            id="officeLatitude"
            name="officeLatitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="28.5921824"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="officeLongitude">Longitude</Label>
          <Input
            id="officeLongitude"
            name="officeLongitude"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="77.0461132"
          />
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={useCurrentLocation}
        disabled={locating || pending}
      >
        {locating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading GPS…
          </>
        ) : (
          <>
            <MapPin className="h-4 w-4" />
            Use my current location
          </>
        )}
      </Button>

      {mapEmbed ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Preview</p>
          <iframe
            src={mapEmbed}
            className="aspect-video w-full rounded-md border"
            loading="lazy"
            title="Office location preview"
          />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="officeRadiusMeters">
            Geofence radius (meters)
          </Label>
          <Input
            id="officeRadiusMeters"
            name="officeRadiusMeters"
            type="number"
            min={10}
            max={5000}
            defaultValue={initial.officeRadiusMeters}
            required
          />
          <p className="text-xs text-muted-foreground">
            200m is a good default. Increase for large compounds.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="accuracyRejectThresholdM">
            Reject if GPS accuracy worse than (m)
          </Label>
          <Input
            id="accuracyRejectThresholdM"
            name="accuracyRejectThresholdM"
            type="number"
            min={100}
            max={5000}
            defaultValue={initial.accuracyRejectThresholdM}
            required
          />
          <p className="text-xs text-muted-foreground">
            500m prevents indoor multi-floor false positives.
          </p>
        </div>
      </div>

      {/* Anti-fraud — trusted office IPs.
          Rule: geofence OR IP match → AUTO_APPROVED. Empty list =
          IP check disabled (geofence still works). */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start gap-2">
          <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-2">
            <Label htmlFor="trustedOfficeIps" className="text-sm">
              Trusted office IPs &mdash; anti-fraud
            </Label>
            <Textarea
              id="trustedOfficeIps"
              name="trustedOfficeIps"
              value={trustedIps}
              onChange={(e) => setTrustedIps(e.target.value)}
              rows={Math.max(2, trustedIps.split("\n").length + 1)}
              placeholder="192.168.1.1&#10;103.45.67.89"
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={detectCurrentIp}
                disabled={detectingIp || pending}
              >
                {detectingIp ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Detecting…
                  </>
                ) : (
                  <>
                    <Wifi className="h-3 w-3" />
                    Use my current IP
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              One IP per line. When an employee punches from an IP in this
              list, the punch auto-approves even if GPS fails (e.g. indoors,
              poor signal). Punches from an unknown IP still auto-approve
              if GPS confirms the office geofence. Leave empty to disable
              the IP check entirely &mdash; geofence alone will decide.
              Tip: while at the office, click &ldquo;Use my current IP&rdquo;
              to add it. Your ISP&apos;s IP may change occasionally &mdash;
              re-add it then.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="expectedHoursPerDay">
            Expected hours per day
          </Label>
          <Input
            id="expectedHoursPerDay"
            name="expectedHoursPerDay"
            type="number"
            step="0.5"
            min={0.5}
            max={16}
            defaultValue={initial.expectedHoursPerDay}
            required
          />
          <p className="text-xs text-muted-foreground">
            Drives the half-shift credit math: 4h = 1 credit.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="weeklyOffsPerWeek">Weekly offs per week</Label>
          <Input
            id="weeklyOffsPerWeek"
            name="weeklyOffsPerWeek"
            type="number"
            min={0}
            max={7}
            defaultValue={initial.weeklyOffsPerWeek}
            required
          />
          <p className="text-xs text-muted-foreground">
            1 = one floating off-day per week.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="paidLeavesPerMonth">Paid leaves per month</Label>
          <Input
            id="paidLeavesPerMonth"
            name="paidLeavesPerMonth"
            type="number"
            step="0.5"
            min={0}
            max={31}
            defaultValue={initial.paidLeavesPerMonth}
            required
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save settings"
          )}
        </Button>
      </div>
    </form>
  );
}
