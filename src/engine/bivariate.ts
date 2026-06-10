import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import { postcodeOutline } from "./mapStyle";

/**
 * 3×3 bivariate colour matrix.
 * Rows = EV ownership class (0=low, 1=med, 2=high).
 * Cols = SES advantage class (0=low, 1=med, 2=high).
 *
 * Reading the spec:
 *   high EV + low SES  → blue       (people choosing EVs despite lower income)
 *   high EV + high SES → charcoal   (affluent EV adopters - Melbourne inner east)
 *   low EV  + low SES  → near-white (low of both)
 *   low EV  + high SES → orange     (wealthy areas not yet adopting EVs)
 *
 * The blue→orange axes are the two single-variable ramps; they blend to
 * grey/charcoal where both are high.
 */
export const BIVARIATE_COLORS: readonly [string, string, string][] = [
  // EV low
  ["#EEF0F5", "#FBCFAA", "#D95F02"],
  // EV med
  ["#8EC3E8", "#B8BBC1", "#9B6B55"],
  // EV high
  ["#0052C2", "#4E6880", "#1A2B38"],
] as const;

// Flat array for renderer construction: index = evClass * 3 + sesClass (0–8)
export const BIVARIATE_CLASS_LABELS: readonly string[] = [
  "Low EV / Low SES",    // 0
  "Low EV / Med SES",    // 1
  "Low EV / High SES",   // 2
  "Med EV / Low SES",    // 3
  "Med EV / Med SES",    // 4
  "Med EV / High SES",   // 5
  "High EV / Low SES",   // 6
  "High EV / Med SES",   // 7
  "High EV / High SES",  // 8
] as const;

const GREY_SYMBOL = new SimpleFillSymbol({ color: [217, 217, 217, 200], outline: postcodeOutline() });

/** class index 0–8 → hex colour */
export function bivariateColor(classIndex: number): string {
  const evClass  = Math.floor(classIndex / 3); // 0–2
  const sesClass = classIndex % 3;              // 0–2
  return BIVARIATE_COLORS[evClass][sesClass];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function makeSymbol(classIndex: number): SimpleFillSymbol {
  const [r, g, b] = hexToRgb(bivariateColor(classIndex));
  // Alpha 200 (~78%) keeps fills opaque enough to read while letting roads show.
  return new SimpleFillSymbol({ color: [r, g, b, 200], outline: postcodeOutline() });
}

/**
 * Classifies each postcode into one of 9 bivariate classes.
 *
 * Returns Map<postcode, classIndex 0–8> where classIndex = evClass*3 + sesClass.
 * Tertile breaks are computed from the current data (not hardcoded).
 * Postcodes missing from either variable get class -1 and use the grey symbol.
 */
export function classifyBivariate(
  evPercent: Map<string, number>,
  seifaByPostcode: Map<string, number>,
  allPostcodes: string[]
): Map<string, number> {
  // Compute tertile breaks for EV%
  const evValues = allPostcodes
    .map((pc) => evPercent.get(pc))
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);

  const sesValues = allPostcodes
    .map((pc) => seifaByPostcode.get(pc))
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);

  const evT1  = evValues[Math.floor(evValues.length / 3)];
  const evT2  = evValues[Math.floor((2 * evValues.length) / 3)];
  const sesT1 = sesValues[Math.floor(sesValues.length / 3)];
  const sesT2 = sesValues[Math.floor((2 * sesValues.length) / 3)];

  console.log(
    `[bivariate] EV% tertiles: ${evT1.toFixed(2)} / ${evT2.toFixed(2)}  ` +
    `SES tertiles: ${sesT1} / ${sesT2}`
  );

  const result = new Map<string, number>();
  for (const pc of allPostcodes) {
    const ev  = evPercent.get(pc);
    const ses = seifaByPostcode.get(pc);
    if (ev === undefined || ses === undefined) {
      result.set(pc, -1); // no data
      continue;
    }
    const evClass  = ev  <= evT1  ? 0 : ev  <= evT2  ? 1 : 2;
    const sesClass = ses <= sesT1 ? 0 : ses <= sesT2 ? 1 : 2;
    result.set(pc, evClass * 3 + sesClass);
  }
  return result;
}

/**
 * Builds a UniqueValueRenderer keyed on POSTCODE for the bivariate choropleth.
 * Same no-applyEdits approach as the single-variable renderer.
 */
export function buildBivariateRenderer(
  classMap: Map<string, number>
): UniqueValueRenderer {
  const uniqueValueInfos = [];

  for (const [pc, cls] of classMap) {
    if (cls < 0) continue;
    uniqueValueInfos.push({
      value: pc,
      symbol: makeSymbol(cls),
      label: BIVARIATE_CLASS_LABELS[cls],
    });
  }

  return new UniqueValueRenderer({
    field: "POSTCODE",
    defaultSymbol: GREY_SYMBOL,
    uniqueValueInfos,
  });
}

/** Returns the breaks used for legend display. */
export function getBivariateBreaks(
  evPercent: Map<string, number>,
  seifaByPostcode: Map<string, number>,
  allPostcodes: string[]
): { evT1: number; evT2: number; sesT1: number; sesT2: number } {
  const evValues  = allPostcodes.map((pc) => evPercent.get(pc)).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  const sesValues = allPostcodes.map((pc) => seifaByPostcode.get(pc)).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  return {
    evT1:  evValues[Math.floor(evValues.length / 3)],
    evT2:  evValues[Math.floor((2 * evValues.length) / 3)],
    sesT1: sesValues[Math.floor(sesValues.length / 3)],
    sesT2: sesValues[Math.floor((2 * sesValues.length) / 3)],
  };
}
