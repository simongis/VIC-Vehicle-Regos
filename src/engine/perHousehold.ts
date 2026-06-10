import type { AggregateResult } from "../types";

// ---------------------------------------------------------------------------
// Explore "vehicles per household" metric.
//
// The numerator is the per-postcode SUM(TOTAL1) returned by aggregate(). One
// wrinkle (see cars_data_update/DATA_PIPELINE.md): each vehicles_YYYY.json sums
// the year's quarterly *whole-fleet snapshots*, so a full year double-counts a
// standing vehicle once per quarter. Left as-is, "vehicles per household" would
// read 4-12 (a year's worth of snapshots over households), not a real-world
// figure. Dividing by the number of quarters in the year recovers the fleet
// size, giving the realistic ~1-3 vehicles/household the metric is meant to be.
//
// The quarter count is year-dependent (2023 started at Q2; 2026 has only Q1 so
// far), so the divisor cannot be a constant. Sourced here from the known
// coverage; ideally this moves into vehicles_meta.json via the data pipeline.
// ---------------------------------------------------------------------------

export const QUARTERS_BY_YEAR: Record<number, number> = {
  2023: 3, // Q2-Q4 (Q1 2023 never published)
  2024: 4,
  2025: 4,
  2026: 1, // Q1 only, so far
};

export function quartersForYear(year: number): number {
  return QUARTERS_BY_YEAR[year] ?? 1;
}

export interface PerHouseholdEntry {
  /** Raw SUM(TOTAL1) for the postcode under the active filter (registration records, multi-quarter). */
  aggregateTotal: number;
  /** Estimated standing fleet = aggregateTotal / quarters-in-year. */
  fleet: number;
  /** ABS occupied private dwellings, or null where the Census did not match / 0. */
  households: number | null;
  /** fleet / households, or null when households is null. */
  vehiclesPerHousehold: number | null;
}

export interface PerHouseholdResult {
  byPostcode: Map<string, PerHouseholdEntry>;
  /** Population-weighted Victorian average = SUM(fleet) / SUM(households), over postcodes with both. Null if none. */
  vicAvg: number | null;
}

/**
 * Joins the per-postcode aggregate totals to ABS household counts and computes
 * vehicles-per-household for every geometry postcode.
 *
 * Edge cases (per spec):
 *  - households null/0  -> vehiclesPerHousehold null (caller renders grey, "No household data")
 *  - aggregateTotal 0   -> vehiclesPerHousehold 0   (caller renders lightest colour, NOT grey)
 */
export function computePerHousehold(
  totals: AggregateResult,
  householdsByPostcode: Map<string, number>,
  allPostcodes: string[],
  year: number
): PerHouseholdResult {
  const quarters = quartersForYear(year);
  const byPostcode = new Map<string, PerHouseholdEntry>();

  let fleetSum = 0;
  let hhSum = 0;

  for (const pc of allPostcodes) {
    const aggregateTotal = totals.get(pc) ?? 0;
    const fleet = aggregateTotal / quarters;
    const households = householdsByPostcode.get(pc) ?? null;
    const vehiclesPerHousehold = households != null ? fleet / households : null;

    byPostcode.set(pc, { aggregateTotal, fleet, households, vehiclesPerHousehold });

    if (households != null) {
      fleetSum += fleet;
      hhSum += households;
    }
  }

  const vicAvg = hhSum > 0 ? fleetSum / hhSum : null;
  return { byPostcode, vicAvg };
}
