import { describe, expect, it } from "vitest";
import {
  distanceMeters,
  evaluatePunchLocation,
  isNullIslandReading,
} from "../geofence";

/**
 * Geofence math tests. Adversarial audit (2026-06-22) caught two bugs
 * that needed permanent regression cover:
 *
 *   1. punchAction used truthy-check (`settings.officeLatitude ? ...`)
 *      which would silently treat an office at the equator (lat 0.0)
 *      as unconfigured. Fix: actions.ts uses `!= null`. Test that
 *      evaluatePunchLocation works correctly with officeLat=0.
 *
 *   2. (0,0) "Null Island" GPS readings (Gulf of Guinea) were accepted
 *      as valid coordinates and routed to PENDING with a 7,200km
 *      distance — wasting OWNER attention on spoofed/buggy reads.
 *      Fix: evaluatePunchLocation now returns REJECT_UNCERTAIN for
 *      (0,0) and near-zero readings.
 */

describe("distanceMeters", () => {
  it("same point → 0m", () => {
    expect(distanceMeters(28.5921, 77.0461, 28.5921, 77.0461)).toBe(0);
  });
  it("Delhi office to a point 100m east is ~100m", () => {
    // 1 degree of longitude at Delhi (~28.5°N) is ~98 km.
    // 100m ≈ 0.001020 degrees.
    const d = distanceMeters(28.5921, 77.0461, 28.5921, 77.0461 + 0.00102);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });
  it("Delhi to Mumbai is ~1150 km (sanity)", () => {
    const d = distanceMeters(28.6139, 77.209, 19.076, 72.8777);
    expect(d).toBeGreaterThan(1_100_000);
    expect(d).toBeLessThan(1_200_000);
  });
});

describe("isNullIslandReading", () => {
  it("exactly (0,0) is sentinel", () => {
    expect(isNullIslandReading(0, 0)).toBe(true);
  });
  it("noisy near-zero is sentinel", () => {
    expect(isNullIslandReading(1e-9, -1e-9)).toBe(true);
  });
  it("real coordinates are NOT sentinel", () => {
    expect(isNullIslandReading(28.5921, 77.0461)).toBe(false);
  });
  it("lat=0 only (equator over Indian Ocean) is NOT sentinel — lng is real", () => {
    expect(isNullIslandReading(0, 73)).toBe(false);
  });
  it("lng=0 only (Greenwich) is NOT sentinel — lat is real", () => {
    expect(isNullIslandReading(51.4769, 0)).toBe(false);
  });
});

describe("evaluatePunchLocation", () => {
  const baseInput = {
    pointAccuracyM: 20,
    officeLat: 28.5921824,
    officeLng: 77.0461132,
    officeRadiusM: 200,
    accuracyRejectThresholdM: 500,
  };

  describe("AUTO_APPROVED inside the radius", () => {
    it("exact office coordinates → AUTO_APPROVED, distance 0", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        pointLat: 28.5921824,
        pointLng: 77.0461132,
      });
      expect(r.status).toBe("AUTO_APPROVED");
      expect(r.distanceM).toBe(0);
    });
    it("50m away → AUTO_APPROVED", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        pointLat: 28.5921824 + 0.00045, // ~50m north
        pointLng: 77.0461132,
      });
      expect(r.status).toBe("AUTO_APPROVED");
      expect(r.distanceM).toBeGreaterThan(40);
      expect(r.distanceM).toBeLessThan(60);
    });
  });

  describe("PENDING outside the radius", () => {
    it("500m away → PENDING", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        pointLat: 28.5921824 + 0.0045, // ~500m north
        pointLng: 77.0461132,
      });
      expect(r.status).toBe("PENDING");
      expect(r.distanceM).toBeGreaterThan(450);
    });
  });

  describe("Equator office (lat=0) — audit-fix for truthiness bug", () => {
    it("office at (0, 73) is treated as CONFIGURED, not as null", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        officeLat: 0,
        officeLng: 73,
        pointLat: 0,
        pointLng: 73,
      });
      expect(r.status).toBe("AUTO_APPROVED");
      expect(r.distanceM).toBe(0);
    });
    it("office at (0, 73), employee at (0.01, 73) → distance ~1.1km → PENDING", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        officeLat: 0,
        officeLng: 73,
        pointLat: 0.01,
        pointLng: 73,
      });
      expect(r.status).toBe("PENDING");
      expect(r.distanceM).toBeGreaterThan(1000);
    });
  });

  describe("Null Island GPS readings — audit-fix", () => {
    it("(0,0) coords → REJECT_UNCERTAIN (sentinel)", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        pointLat: 0,
        pointLng: 0,
      });
      expect(r.status).toBe("REJECT_UNCERTAIN");
      expect(r.distanceM).toBe(null);
    });
    it("noisy near-zero (1e-9) coords → REJECT_UNCERTAIN", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        pointLat: 1e-9,
        pointLng: -1e-9,
      });
      expect(r.status).toBe("REJECT_UNCERTAIN");
    });
  });

  describe("Accuracy reject threshold", () => {
    it("accuracy below threshold → evaluates normally", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        pointLat: 28.5921824,
        pointLng: 77.0461132,
        pointAccuracyM: 100,
      });
      expect(r.status).toBe("AUTO_APPROVED");
    });
    it("accuracy at threshold → still evaluates normally (inclusive)", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        pointLat: 28.5921824,
        pointLng: 77.0461132,
        pointAccuracyM: 500,
      });
      expect(r.status).toBe("AUTO_APPROVED");
    });
    it("accuracy above threshold → REJECT_UNCERTAIN", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        pointLat: 28.5921824,
        pointLng: 77.0461132,
        pointAccuracyM: 1000,
      });
      expect(r.status).toBe("REJECT_UNCERTAIN");
      expect(r.distanceM).toBe(null);
    });
  });

  describe("Office unconfigured → PENDING", () => {
    it("officeLat null + officeLng null → PENDING", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        officeLat: null,
        officeLng: null,
        pointLat: 28.5921824,
        pointLng: 77.0461132,
      });
      expect(r.status).toBe("PENDING");
      expect(r.distanceM).toBe(null);
    });
    it("officeLat null but lng set → still PENDING (incomplete config)", () => {
      const r = evaluatePunchLocation({
        ...baseInput,
        officeLat: null,
        officeLng: 77.0461132,
        pointLat: 28.5921824,
        pointLng: 77.0461132,
      });
      expect(r.status).toBe("PENDING");
    });
  });
});
