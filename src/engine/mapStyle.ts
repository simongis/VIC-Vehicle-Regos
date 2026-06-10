/**
 * Shared map symbology so every choropleth view looks consistent.
 *
 * Postcode outline: a thin, slightly-transparent dark navy (a touch darker than
 * the state border at #003174), replacing the old thick white hairline. Defined
 * once here and reused by every renderer so changing it changes all views.
 */
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";

// #002147, ~10% transparent. Slightly darker than the state border (#003174).
export const POSTCODE_OUTLINE_COLOR: [number, number, number, number] = [0, 33, 71, 0.9];
export const POSTCODE_OUTLINE_WIDTH = 0.3;

// State border: same navy family, a touch lighter and thicker so the state edge
// reads above the postcode hairlines.
export const STATE_BORDER_COLOR: [number, number, number, number] = [0, 49, 116, 0.85];
export const STATE_BORDER_WIDTH = 1.4;

/** A fresh postcode-outline symbol (don't share one instance across renderers). */
export function postcodeOutline(): SimpleLineSymbol {
  return new SimpleLineSymbol({ color: [...POSTCODE_OUTLINE_COLOR], width: POSTCODE_OUTLINE_WIDTH });
}
