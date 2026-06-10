import type { FilterState, AggregateResult, VehiclesMeta, VehiclesYear } from "../types";

/**
 * Filters the in-memory vehicle rows for the given FilterState and sums
 * TOTAL1 per postcode.
 *
 * Single O(n) pass - ~125K rows per year file, typically <15ms.
 * Returns Map<postcode, total>; postcodes with no matching rows are absent
 * (not present with 0 - callers treat absence as 0).
 *
 * Year is already expressed by which VehiclesYear was loaded; this function
 * only applies the make and fuel dimension filters.
 */
export function aggregate(
  filterState: FilterState,
  meta: VehiclesMeta,
  yearData: VehiclesYear
): AggregateResult {
  const { makes, fuels } = filterState;

  // Convert filter codes → index sets for O(1) lookup in the hot loop.
  const makeSet: Set<number> | null =
    makes.length > 0
      ? new Set(
          makes
            .map((m) => meta.makes.indexOf(m))
            .filter((i) => i !== -1)
        )
      : null;

  const fuelSet: Set<number> | null =
    fuels.length > 0
      ? new Set(
          fuels
            .map((f) => meta.fuels.indexOf(f))
            .filter((i) => i !== -1)
        )
      : null;

  const result: AggregateResult = new Map();

  for (const [pcIdx, makeIdx, fuelIdx, total] of yearData.rows) {
    if (makeSet && !makeSet.has(makeIdx)) continue;
    if (fuelSet && !fuelSet.has(fuelIdx)) continue;

    const postcode = meta.postcodes[pcIdx];
    result.set(postcode, (result.get(postcode) ?? 0) + total);
  }

  return result;
}

/** Sums all values in an AggregateResult. */
export function sumTotals(result: AggregateResult): number {
  let total = 0;
  for (const v of result.values()) total += v;
  return total;
}
