import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import { postcodeOutline } from "./mapStyle";
import type { AggregateResult } from "../types";

// Choropleth colour ramp - aligned with Ripple tokens.css variables.
const LOW_RGB  = [221, 232, 247] as const;  // #dde8f7 - near rpl-clr-accent-alt
const HIGH_RGB = [0,   49,  116] as const;  // #003174 - rpl-clr-primary-alt (Ripple nav)
const GREY_RGB = [217, 217, 217] as const;  // #d9d9d9 - neutral grey - no data

const FILL_ALPHA   = 200;  // polygon fill opacity (0-255); ~78% so basemap roads show through

const GREY_SYMBOL = new SimpleFillSymbol({
  color: [...GREY_RGB, FILL_ALPHA],
  outline: postcodeOutline(),
});

function lerp(t: number): [number, number, number] {
  return [
    Math.round(LOW_RGB[0] + t * (HIGH_RGB[0] - LOW_RGB[0])),
    Math.round(LOW_RGB[1] + t * (HIGH_RGB[1] - LOW_RGB[1])),
    Math.round(LOW_RGB[2] + t * (HIGH_RGB[2] - LOW_RGB[2])),
  ];
}

function makeSymbol(total: number, p2: number, p98: number): SimpleFillSymbol {
  if (total === 0) return GREY_SYMBOL;

  // Clamp to [p2, p98] so outliers don't flatten the majority into pale blue.
  const range = p98 - p2;
  const t = range > 0 ? Math.max(0, Math.min(1, (total - p2) / range)) : 1;
  const [r, g, b] = lerp(t);
  return new SimpleFillSymbol({ color: [r, g, b, FILL_ALPHA], outline: postcodeOutline() });
}

/**
 * Builds a UniqueValueRenderer keyed on the POSTCODE field.
 *
 * Each postcode gets its own colour derived from its total registration count.
 * Postcodes with total > 0 are included explicitly; postcodes absent from
 * `allPostcodes` or with total = 0 fall through to the grey defaultSymbol.
 *
 * Endpoints are clamped to the 2nd and 98th percentile of the non-zero
 * distribution so outliers (e.g. Melbourne CBD) don't collapse everyone else
 * into the palest blue.
 */
export function buildRenderer(
  totals: AggregateResult,
  allPostcodes: string[]
): UniqueValueRenderer {
  // Compute percentiles over non-zero values only.
  const nonZero = Array.from(totals.values())
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const p2 = nonZero[Math.max(0, Math.floor(nonZero.length * 0.02))] ?? 0;
  const p98 = nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * 0.98))] ?? 0;

  const uniqueValueInfos = allPostcodes
    .filter((pc) => (totals.get(pc) ?? 0) > 0)
    .map((pc) => ({
      value: pc,
      symbol: makeSymbol(totals.get(pc)!, p2, p98),
    }));

  return new UniqueValueRenderer({
    field: "POSTCODE",
    defaultSymbol: GREY_SYMBOL,
    uniqueValueInfos,
  });
}

/**
 * Per-household renderer. Same blue ramp + percentile clamp as buildRenderer,
 * but the value per postcode is a float (vehicles per household) that may be
 * null. Distinct null/zero handling per the Explore spec:
 *   - value null (no ABS household data) -> grey defaultSymbol
 *   - value 0    (no matching vehicles)  -> lightest colour, NOT grey
 *   - otherwise  -> clamped to [p2, p98] of the non-zero distribution
 */
export function buildPerHouseholdRenderer(
  perHousehold: Map<string, number | null>,
  allPostcodes: string[]
): UniqueValueRenderer {
  const { p2, p98 } = getPerHouseholdStats(perHousehold, allPostcodes);
  const range = p98 - p2;

  const uniqueValueInfos = allPostcodes
    .filter((pc) => perHousehold.get(pc) != null) // null -> grey default
    .map((pc) => {
      const v = perHousehold.get(pc) as number;
      const t = v <= 0 ? 0 : range > 0 ? Math.max(0, Math.min(1, (v - p2) / range)) : 1;
      const [r, g, b] = lerp(t);
      return { value: pc, symbol: new SimpleFillSymbol({ color: [r, g, b, FILL_ALPHA], outline: postcodeOutline() }) };
    });

  return new UniqueValueRenderer({
    field: "POSTCODE",
    defaultSymbol: GREY_SYMBOL,
    uniqueValueInfos,
  });
}

/** Percentile stats over the non-null, non-zero per-household values (for the legend ramp). */
export function getPerHouseholdStats(
  perHousehold: Map<string, number | null>,
  allPostcodes: string[]
): { p2: number; p98: number; max: number; withData: number } {
  const vals = allPostcodes
    .map((pc) => perHousehold.get(pc))
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);

  return {
    p2:  vals[Math.max(0, Math.floor(vals.length * 0.02))] ?? 0,
    p98: vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.98))] ?? 0,
    max: vals[vals.length - 1] ?? 0,
    withData: allPostcodes.filter((pc) => perHousehold.get(pc) != null).length,
  };
}

/** Returns the percentile stats for legend rendering. */
export function getRendererStats(totals: AggregateResult): {
  p2: number;
  p98: number;
  max: number;
  nonZeroCount: number;
} {
  const nonZero = Array.from(totals.values())
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  return {
    p2:  nonZero[Math.max(0, Math.floor(nonZero.length * 0.02))] ?? 0,
    p98: nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * 0.98))] ?? 0,
    max: nonZero[nonZero.length - 1] ?? 0,
    nonZeroCount: nonZero.length,
  };
}
