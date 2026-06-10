import type { VehiclesMeta, VehiclesYear } from "../types";

export interface EVPercentResult {
  /** EV ownership % per postcode: 0–100. Absent = no registrations at all. */
  evPercent: Map<string, number>;
  /** Raw EV registration count per postcode (numerator). */
  evCount: Map<string, number>;
  /** Total registration count per postcode across all fuels (denominator). */
  allCount: Map<string, number>;
}

/**
 * Computes EV ownership % per postcode from the in-memory year data.
 *
 *   EV% = SUM(TOTAL1 where fuel = "E") / SUM(TOTAL1 all fuels) × 100
 *
 * Single O(n) pass - ~125K rows, <10ms. Returns both the percentage and the
 * raw numerator/denominator so callers can display counts alongside %.
 *
 * Electric code "E" confirmed from Phase 0 fuel-decode table.
 */
export function computeEVPercent(
  meta: VehiclesMeta,
  yearData: VehiclesYear
): EVPercentResult {
  const electricIdx = meta.fuels.indexOf("E");
  if (electricIdx === -1) {
    console.warn("[evPercent] Fuel code 'E' not found in meta.fuels:", meta.fuels);
  }

  const evCount  = new Map<string, number>();
  const allCount = new Map<string, number>();

  for (const [pcIdx, , fuelIdx, total] of yearData.rows) {
    const pc = meta.postcodes[pcIdx];
    allCount.set(pc, (allCount.get(pc) ?? 0) + total);
    if (fuelIdx === electricIdx) {
      evCount.set(pc, (evCount.get(pc) ?? 0) + total);
    }
  }

  const evPercent = new Map<string, number>();
  for (const [pc, all] of allCount) {
    if (all > 0) {
      evPercent.set(pc, ((evCount.get(pc) ?? 0) / all) * 100);
    }
  }

  return { evPercent, evCount, allCount };
}

/**
 * Classifies postcodes into tertiles (low/med/high = 0/1/2) on EV%.
 * Returns a Map<postcode, 0|1|2>. Used by the bivariate renderer once
 * SEIFA data is available for the second axis.
 */
export function classifyIntoTertiles(
  values: Map<string, number>
): Map<string, 0 | 1 | 2> {
  const sorted = [...values.values()].sort((a, b) => a - b);
  const n = sorted.length;
  const t1 = sorted[Math.floor(n / 3)];      // 33rd percentile break
  const t2 = sorted[Math.floor((2 * n) / 3)]; // 67th percentile break

  const result = new Map<string, 0 | 1 | 2>();
  for (const [pc, v] of values) {
    result.set(pc, v <= t1 ? 0 : v <= t2 ? 1 : 2);
  }
  return result;
}
