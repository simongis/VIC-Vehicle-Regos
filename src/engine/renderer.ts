import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import { postcodeOutline } from "./mapStyle";
import { classIndexFor } from "./fixedStretch";
import type { FixedClassBreaks } from "./fixedStretch";

// ColorBrewer Blues, 6 classes, stretched to the full lightness range
// (near-white -> very dark navy) so each class step is clearly discriminable.
// Exported for the Legend swatches - single source of truth.
export const CLASS_COLORS = [
  "#f7fbff",
  "#c6dbef",
  "#9ecae1",
  "#6baed6",
  "#3182bd",
  "#08306b",
] as const;

const GREY_RGB = [217, 217, 217] as const; // #d9d9d9 - neutral grey - no data

// Polygon fill opacity. NOTE: the ArcGIS Color alpha channel is a 0-1 FLOAT
// (values above 1 clamp to fully opaque - see BACKLOG B-004); ~0.78 keeps the
// basemap roads faintly visible through the fill.
const FILL_ALPHA = 0.78;

const GREY_SYMBOL = new SimpleFillSymbol({
  color: [...GREY_RGB, FILL_ALPHA],
  outline: postcodeOutline(),
});

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// One symbol per class, built once - 694 postcodes share 6 symbol instances.
const CLASS_SYMBOLS = CLASS_COLORS.map(
  (hex) =>
    new SimpleFillSymbol({
      color: [...hexToRgb(hex), FILL_ALPHA],
      outline: postcodeOutline(),
    })
);

/**
 * Classed choropleth renderer over FIXED cross-year breaks.
 *
 * The same value lands in the same class in every year, so playing through
 * years shows real change as visible class jumps (see engine/fixedStretch.ts
 * for the rationale and how the breaks are derived).
 *
 * Value semantics per postcode:
 *  - null      -> grey defaultSymbol ("no data": no ABS households in per-HH
 *                 mode, or zero matching vehicles in fleet mode)
 *  - 0         -> lowest class (a real measured zero, per-HH mode only)
 *  - otherwise -> its fixed class
 */
export function buildClassedRenderer(
  values: Map<string, number | null>,
  allPostcodes: string[],
  fixed: FixedClassBreaks
): UniqueValueRenderer {
  const uniqueValueInfos = allPostcodes
    .filter((pc) => values.get(pc) != null)
    .map((pc) => {
      const v = values.get(pc) as number;
      const idx = v <= 0 ? 0 : classIndexFor(fixed.breaks, v);
      return { value: pc, symbol: CLASS_SYMBOLS[idx] };
    });

  return new UniqueValueRenderer({
    field: "POSTCODE",
    defaultSymbol: GREY_SYMBOL,
    uniqueValueInfos,
  });
}

/** Per-class postcode counts for the current values (legend annotations). */
export function classCounts(
  values: Map<string, number | null>,
  allPostcodes: string[],
  fixed: FixedClassBreaks
): number[] {
  const counts = new Array(CLASS_COLORS.length).fill(0);
  for (const pc of allPostcodes) {
    const v = values.get(pc);
    if (v == null) continue;
    counts[v <= 0 ? 0 : classIndexFor(fixed.breaks, v)]++;
  }
  return counts;
}
