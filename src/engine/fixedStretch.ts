/**
 * Fixed cross-year class breaks for the Explore choropleth.
 *
 * WHY FIXED: a per-year stretch renormalises the colours every year, so playing
 * through years erases statewide change (if every postcode grows 4%, the scale
 * grows 4% and nothing moves). Breaks are computed ONCE across ALL available
 * years for the current filter + metric, then held while the year changes - the
 * same value lands in the same class in every year, so real change shows.
 *
 * WHY CLASSED (Simon's call, 2026-06-10): the underlying fleet only moves 2-3%
 * a year. On a continuous ramp that is an imperceptible colour nudge; with
 * fixed class breaks a growing postcode visibly JUMPS a class when it crosses a
 * break. This is the census-atlas standard for demographic rates.
 *
 * Breaks are quantile-derived from the combined-years distribution (so each
 * class holds a meaningful share of postcodes) then rounded to clean "nice"
 * values for a readable legend.
 */
import { aggregate } from "./aggregate";
import { getYearData } from "./loadData";
import type { DataStore } from "./loadData";
import { quartersForYear } from "./perHousehold";
import { AggregateCache } from "./cache";
import type { FilterState } from "../types";

/** 6 classes = 5 interior breaks. Class i covers [breaks[i-1], breaks[i]). */
export const CLASS_COUNT = 6;

export interface FixedClassBreaks {
  /** 5 ascending interior break values, nice-rounded. */
  breaks: number[];
  /** Year span the breaks were computed over, for the legend footer. */
  years: [number, number];
}

/** Index (0-5) of the class a value falls in. */
export function classIndexFor(breaks: number[], v: number): number {
  for (let i = 0; i < breaks.length; i++) {
    if (v < breaks[i]) return i;
  }
  return breaks.length;
}

// Snap a value to the nearest "nice" mantissa x 10^n so breaks read as
// 1.5 / 2.5 / 8,000 / 15,000 rather than 1.43 / 2.61 / 7,834 / 15,492.
const NICE_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceRound(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / mag;
  let best = NICE_MANTISSAS[0];
  for (const c of NICE_MANTISSAS) {
    if (Math.abs(c - m) < Math.abs(best - m)) best = c;
  }
  return best * mag;
}
/** The next nice value strictly above v (used to bump duplicate breaks apart). */
function niceAbove(v: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(v <= 0 ? 1 : v)));
  const m = v / mag;
  for (const c of NICE_MANTISSAS) {
    if (c * mag > v + mag * 1e-9 && c > m) return c * mag;
  }
  return 10 * mag;
}

export type BreaksMetric = "per_household" | "total";

/**
 * Computes the fixed class breaks for a filter + metric over every year in the
 * data. Values are quarter-normalised (fleet = records / quarters-in-year) in
 * BOTH metrics so years are genuinely comparable; per-household divides by ABS
 * households on top. Aggregations go through the shared cache; the first call
 * for a new filter may fetch not-yet-loaded year files.
 */
export async function computeFixedBreaks(
  store: DataStore,
  filter: Pick<FilterState, "fuels" | "makes">,
  metric: BreaksMetric,
  householdsByPostcode: Map<string, number>,
  allPostcodes: string[],
  cache: AggregateCache
): Promise<FixedClassBreaks> {
  const vals: number[] = [];
  const years = [...store.meta.years].sort((a, b) => a - b);

  for (const year of years) {
    const yearData = await getYearData(store, year);
    const fs: FilterState = { year, fuels: filter.fuels, makes: filter.makes };
    let totals = cache.get(fs);
    if (!totals) {
      totals = aggregate(fs, store.meta, yearData);
      cache.set(fs, totals);
    }
    const quarters = quartersForYear(year);
    for (const pc of allPostcodes) {
      const records = totals.get(pc) ?? 0;
      if (records <= 0) continue;
      const fleet = records / quarters;
      if (metric === "per_household") {
        const hh = householdsByPostcode.get(pc);
        if (hh != null && hh > 0) vals.push(fleet / hh);
      } else {
        vals.push(fleet);
      }
    }
  }

  vals.sort((a, b) => a - b);
  const at = (p: number) =>
    vals[Math.min(vals.length - 1, Math.max(0, Math.floor(vals.length * p)))] ?? 0;

  // Quantile-derived interior breaks (1/6 .. 5/6), each rounded to a nice value,
  // bumped upward where rounding collapses neighbours together.
  const breaks: number[] = [];
  for (let i = 1; i < CLASS_COUNT; i++) {
    let b = niceRound(at(i / CLASS_COUNT));
    while (breaks.length > 0 && b <= breaks[breaks.length - 1]) b = niceAbove(b);
    breaks.push(b);
  }

  return { breaks, years: [years[0], years[years.length - 1]] };
}
