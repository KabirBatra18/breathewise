/**
 * Geofence distance math for the attendance system.
 *
 * Pure JavaScript Haversine — accurate to sub-meter at our scale (single
 * office, 200m radius), zero Postgres extensions required. Runs at the
 * server-action layer where it's still cheap.
 *
 * Architecture: memory/project_attendance_architecture.md
 */

/**
 * Great-circle distance between two lat/lng points, in meters.
 * Uses the Earth's mean radius (6 371 000m). For our 200m geofence the
 * error from assuming a perfect sphere is well under 1% — way more
 * accurate than the GPS reading we're checking against.
 */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Sentinel-coordinate detector. (0, 0) is the literal point in the Gulf of
 * Guinea — geographically valid but practically always a buggy/spoofed
 * reading. Real GPS hardware never reports it for an Indian user.
 *
 * Returns true if both lat and lng are within 1e-6 (~10cm) of zero. The
 * tolerance exists because some GPS chips report "lock failure" as exactly
 * 0 but slightly noisy floats (e.g. 0.0000001).
 *
 * Audit caught: previously this passed Zod (-90..90 / -180..180) and
 * produced a real Haversine distance, routing the punch to PENDING with
 * an off-site note prompt — wasted owner attention on garbage data.
 */
export function isNullIslandReading(lat: number, lng: number): boolean {
  return Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6;
}

/**
 * Decides what status a punch should land in based on the geofence.
 *
 *   • AUTO_APPROVED   — inside the radius AND GPS accuracy within threshold
 *   • PENDING         — outside the radius OR office not yet configured
 *   • REJECT_UNCERTAIN — GPS accuracy exceeds the threshold OR (0,0) sentinel
 *
 * The REJECT_UNCERTAIN case (returning null distanceM) is the "GPS too
 * uncertain, please step outside" outcome — the caller should refuse the
 * punch entirely rather than save a PENDING row.
 */
export function evaluatePunchLocation(args: {
  pointLat: number;
  pointLng: number;
  pointAccuracyM: number;
  officeLat: number | null;
  officeLng: number | null;
  officeRadiusM: number;
  accuracyRejectThresholdM: number;
}): {
  status: "AUTO_APPROVED" | "PENDING" | "REJECT_UNCERTAIN";
  distanceM: number | null;
} {
  if (args.pointAccuracyM > args.accuracyRejectThresholdM) {
    return { status: "REJECT_UNCERTAIN", distanceM: null };
  }
  // Null Island sentinel — never a legitimate Indian-user GPS reading.
  if (isNullIslandReading(args.pointLat, args.pointLng)) {
    return { status: "REJECT_UNCERTAIN", distanceM: null };
  }
  // Office unconfigured. Use `!= null` (not truthiness) so a legitimate
  // office at the equator (latitude 0.0) isn't silently treated as
  // unconfigured. Audit caught this — actions.ts:113 used `? Number(...) :
  // null` truthiness which would fail at the equator.
  if (args.officeLat == null || args.officeLng == null) {
    return { status: "PENDING", distanceM: null };
  }
  const d = distanceMeters(
    args.pointLat,
    args.pointLng,
    args.officeLat,
    args.officeLng,
  );
  const inside = d <= args.officeRadiusM;
  return {
    status: inside ? "AUTO_APPROVED" : "PENDING",
    distanceM: Math.round(d),
  };
}
