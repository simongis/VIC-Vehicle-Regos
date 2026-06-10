/**
 * "New vs Old vehicles" engine: % of a postcode's fleet manufactured 2020+.
 *
 * Source: vehicle_age_YYYY.json (per-postcode manufacture-era buckets, produced
 * by cars_data_update/scripts/generate_app_data.py, see DATA_PIPELINE.md).
 *
 * Rendering matches the other choropleth presets: a UniqueValueRenderer keyed on
 * POSTCODE, swapped onto the SHARED layer. Geometry is never re-tessellated on
 * view switch and the extent is preserved. Colour = fixed 6-class ColorBrewer
 * RdYlGn scheme (<13/13-17/17-20/20-25/25-30/>30%); a custom legend and a
 * callback popup read from the in-memory profile map.
 */
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import { postcodeOutline } from "./mapStyle";

import type { VehiclesMeta, VehicleAgeYear } from "../types";

const BASE = import.meta.env.BASE_URL;
let cache = new Map<number, VehicleAgeYear>();

export async function loadVehicleAge(year: number): Promise<VehicleAgeYear> {
  const hit = cache.get(year);
  if (hit) return hit;
  const data = await fetch(`${BASE}data/vehicle_age_${year}.json`).then(
    (r) => r.json() as Promise<VehicleAgeYear>
  );
  cache.set(year, data);
  console.log(`[vehicleAge] year ${year}: ${data.rows.length} postcodes`);
  return data;
}

/** The manufacture year used as the "recent" threshold for a given file. */
export function thresholdForYear(data: VehicleAgeYear): number {
  return data.threshold ?? 2020;
}

export interface AgeProfile {
  pctNew: number;      // recent-fleet share of KNOWN-age fleet, 0-100
  newRecs: number;     // recent-fleet count (registration records)
  knownRecs: number;   // total with a known manufacture year
  totalRecs: number;   // all records including unknown manufacture year
  /** counts by bucket, indexed as in VehicleAgeYear.buckets */
  buckets: number[];
}

/**
 * Computes the "recent fleet" share per postcode (keyed by POSTCODE string).
 * "recent" = manufacture year >= data.threshold (or 2020 for legacy files).
 * "unknown" (missing manufacture year, bucket 0) is excluded from the denominator.
 * Looks for "new_recent" bucket first (new files), falls back to "new2020" (legacy).
 */
export function computeAgeProfiles(
  data: VehicleAgeYear,
  meta: VehiclesMeta
): Map<string, AgeProfile> {
  // Support both the new "new_recent" key (E-014) and the legacy "new2020" key.
  const newIdx = data.buckets.indexOf("new_recent") >= 0
    ? data.buckets.indexOf("new_recent")
    : data.buckets.indexOf("new2020");
  const unknownIdx = data.buckets.indexOf("unknown");
  const byPostcode = new Map<string, AgeProfile>();
  for (const [pcIdx, counts] of data.rows) {
    const total = counts.reduce((s, c) => s + c, 0);
    const known = total - (unknownIdx >= 0 ? counts[unknownIdx] : 0);
    const newRecs = newIdx >= 0 ? counts[newIdx] : 0;
    byPostcode.set(meta.postcodes[pcIdx], {
      pctNew: known > 0 ? (newRecs / known) * 100 : 0,
      newRecs,
      knownRecs: known,
      totalRecs: total,
      buckets: counts,
    });
  }
  return byPostcode;
}

// ---------------------------------------------------------------------------
// Fixed 6-class ColorBrewer RdYlGn diverging scheme (colorbrewer2.org).
// Breaks: < 13 / 13-17 / 17-20 / 20-25 / 25-30 / > 30% (fixed, not quantile).
// Red = oldest fleet; green = newest. Matches the original static map symbology.
// ---------------------------------------------------------------------------

export const RDYLGN_6: [number, number, number][] = [
  [215, 48, 39],   // #d73027 dark red   < 13%
  [252, 141, 89],  // #fc8d59 orange     13-17%
  [254, 224, 139], // #fee08b yellow     17-20%
  [217, 239, 139], // #d9ef8b lt green   20-25%
  [145, 207, 96],  // #91cf60 med green  25-30%
  [26, 152, 80],   // #1a9850 dk green   > 30%
];

export const CLASS_LABELS = [
  "< 13%",
  "13 - 17%",
  "17 - 20%",
  "20 - 25%",
  "25 - 30%",
  "> 30%",
];

// Break edges: pctNew in class i if BREAK_EDGES[i] <= pctNew < BREAK_EDGES[i+1]
const BREAK_EDGES = [0, 13, 17, 20, 25, 30, Infinity];

export function classIndex(pctNew: number): number {
  for (let i = 0; i < BREAK_EDGES.length - 1; i++) {
    if (pctNew < BREAK_EDGES[i + 1]) return i;
  }
  return BREAK_EDGES.length - 2;
}

const NODATA = new SimpleFillSymbol({ color: [217, 217, 217, 160], outline: postcodeOutline() });
const FILL_ALPHA = 205; // ~80% opacity; basemap roads show through

/**
 * Builds the POSTCODE-keyed renderer for the shared layer using fixed 6-class
 * RdYlGn breaks. Postcodes with no known-age fleet fall through to the grey
 * "No data" default.
 */
export function buildAgeRendererByPostcode(
  profiles: Map<string, AgeProfile>
): { renderer: UniqueValueRenderer } {
  const uniqueValueInfos = [];
  for (const [pc, p] of profiles) {
    if (p.knownRecs <= 0) continue;
    const ci = classIndex(p.pctNew);
    const [r, g, b] = RDYLGN_6[ci];
    uniqueValueInfos.push({
      value: pc,
      symbol: new SimpleFillSymbol({ color: [r, g, b, FILL_ALPHA], outline: postcodeOutline() }),
    });
  }

  return {
    renderer: new UniqueValueRenderer({
      field: "POSTCODE",
      defaultSymbol: NODATA,
      defaultLabel: "No data",
      uniqueValueInfos,
    }),
  };
}
