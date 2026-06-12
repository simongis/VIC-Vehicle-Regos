import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import FeatureReductionCluster from "@arcgis/core/layers/support/FeatureReductionCluster";
import PieChartRenderer from "@arcgis/core/renderers/PieChartRenderer";
import { postcodeOutline } from "./mapStyle";

import { MAKE_LABELS } from "../types";
import type { VehiclesMeta, VehiclesYear } from "../types";

/** The winning make for a single postcode. */
export interface DominantMake {
  makeIdx: number;
  makeCode: string;   // raw CD_MAKE_VEH1 code ("" = Unknown)
  label: string;      // display label
  count: number;      // winning make's summed TOTAL1 in this postcode
  pcTotal: number;    // postcode total across all makes
  share: number;      // count / pcTotal, 0–1 - "dominance strength"
}

/** A make that wins ≥1 postcode, for the categorical legend. */
export interface MakeWinSummary {
  makeCode: string;
  label: string;
  postcodeWins: number; // how many postcodes this make dominates
  stateTotal: number;   // its total registrations across the state
}

export interface DominantMakeResult {
  byPostcode: Map<string, DominantMake>;
  /** Winning makes, ordered by postcode wins desc (then state total desc). */
  winners: MakeWinSummary[];
}

/** Per-postcode make registration counts for the pie-chart cluster renderer. */
export interface MakeCounts {
  toyota:  number;
  ford:    number;
  holden:  number;
  merc:    number;
  hyundai: number;
  other:   number;
  total:   number;
}

/**
 * For each postcode, finds the make with the highest summed TOTAL1.
 *
 * The data is the static in-memory year file (rows = [pcIdx, makeIdx, fuelIdx,
 * total]); the equivalent of a server-side grouped query
 * (groupBy POSTCODE + CD_MAKE_VEH1, SUM TOTAL1) is a single O(n) pass here
 * accumulating per-postcode make tallies, then an argmax reduce per postcode.
 * ~125K rows → a few ms, consistent with the other engine passes.
 *
 * Tie-break: higher count wins; on an exact tie the more-frequent make overall
 * wins (makes are stored frequency-ordered, so the lower makeIdx). Deterministic.
 */
export function computeDominantMake(
  meta: VehiclesMeta,
  yearData: VehiclesYear
): DominantMakeResult {
  // pcIdx → (makeIdx → summed TOTAL1)
  const tally = new Map<number, Map<number, number>>();
  const pcTotals = new Map<number, number>();

  for (const [pcIdx, makeIdx, , total] of yearData.rows) {
    let makeMap = tally.get(pcIdx);
    if (!makeMap) {
      makeMap = new Map();
      tally.set(pcIdx, makeMap);
    }
    makeMap.set(makeIdx, (makeMap.get(makeIdx) ?? 0) + total);
    pcTotals.set(pcIdx, (pcTotals.get(pcIdx) ?? 0) + total);
  }

  const byPostcode = new Map<string, DominantMake>();
  const winCounts = new Map<number, number>();   // makeIdx → postcode wins
  const stateTotals = new Map<number, number>(); // makeIdx → state total

  for (const [pcIdx, makeMap] of tally) {
    let bestIdx = -1;
    let bestCount = -1;
    for (const [mIdx, c] of makeMap) {
      stateTotals.set(mIdx, (stateTotals.get(mIdx) ?? 0) + c);
      // makeMap iterates in insertion order; a strict > keeps the first-seen
      // (more frequent overall) make on ties - see tie-break note above.
      if (c > bestCount) {
        bestCount = c;
        bestIdx = mIdx;
      }
    }

    const pcTotal = pcTotals.get(pcIdx) ?? 0;
    const makeCode = meta.makes[bestIdx];
    byPostcode.set(meta.postcodes[pcIdx], {
      makeIdx: bestIdx,
      makeCode,
      label: MAKE_LABELS[makeCode] ?? (makeCode || "Unknown"),
      count: bestCount,
      pcTotal,
      share: pcTotal > 0 ? bestCount / pcTotal : 0,
    });
    winCounts.set(bestIdx, (winCounts.get(bestIdx) ?? 0) + 1);
  }

  const winners: MakeWinSummary[] = [...winCounts.entries()]
    .map(([mIdx, postcodeWins]) => {
      const makeCode = meta.makes[mIdx];
      return {
        makeCode,
        label: MAKE_LABELS[makeCode] ?? (makeCode || "Unknown"),
        postcodeWins,
        stateTotal: stateTotals.get(mIdx) ?? 0,
      };
    })
    .sort((a, b) => b.postcodeWins - a.postcodeWins || b.stateTotal - a.stateTotal);

  return { byPostcode, winners };
}

/**
 * Tallies registration counts per postcode broken down into the top-5 makes
 * (Toyota/Ford/Holden/Mercedes-Benz/Hyundai) plus an aggregated Other bucket
 * and a grand total. Used to populate the 7 make-count graphic attribute fields
 * so FeatureReductionCluster can aggregate them in pie-chart mode.
 *
 * Make codes match DOMINANT_PALETTE exactly (including "HYNDAI" and "MERC B").
 */
export function computeMakeBreakdown(
  meta: VehiclesMeta,
  yearData: VehiclesYear
): Map<string, MakeCounts> {
  const result = new Map<string, MakeCounts>();

  for (const [pcIdx, makeIdx, , total] of yearData.rows) {
    const postcode = meta.postcodes[pcIdx];
    const code = meta.makes[makeIdx];
    if (!result.has(postcode)) {
      result.set(postcode, { toyota: 0, ford: 0, holden: 0, merc: 0, hyundai: 0, other: 0, total: 0 });
    }
    const row = result.get(postcode)!;
    row.total += total;
    if      (code === "TOYOTA") row.toyota  += total;
    else if (code === "FORD")   row.ford    += total;
    else if (code === "HOLDEN") row.holden  += total;
    else if (code === "MERC B") row.merc    += total;
    else if (code === "HYNDAI") row.hyundai += total;
    else                        row.other   += total;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rendering
//
// We render this preset the same way as Explore and EV x SES: a
// UniqueValueRenderer keyed on POSTCODE, swapped onto the SHARED layer. No
// dedicated layer is built, so switching into (and out of) the view never
// re-tessellates geometry and the map extent is preserved, exactly like the
// other choropleth presets.
//
// Colour = the winning make (a fixed, colourblind-safe top-5 palette, with a
// neutral "Other" for the handful of postcodes won by a make outside the five).
// Opacity = how strongly that make leads (its share of the postcode total), so
// decisive wins read solid and contested postcodes read faint.
// ---------------------------------------------------------------------------

/**
 * Top-5 categories + colours, drawn from each marque's brand identity (Simon's
 * call) so the map reads intuitively: Toyota red, Ford blue, Holden green, with
 * two distinct "sensible" hues for the remaining two. This trades some of the
 * old Okabe-Ito colourblind-safety for brand recognition; the red/green pair is
 * the usual caveat, mitigated by the legend labels and the popup naming.
 */
export const DOMINANT_PALETTE: { code: string; label: string; color: string }[] = [
  { code: "TOYOTA", label: "Toyota",        color: "#EB0A1E" }, // Toyota red
  { code: "FORD",   label: "Ford",          color: "#00529B" }, // Ford oval blue
  { code: "HOLDEN", label: "Holden",        color: "#00843D" }, // green
  { code: "MERC B", label: "Mercedes-Benz", color: "#7D3C98" }, // distinct violet
  { code: "HYNDAI", label: "Hyundai",       color: "#E69F00" }, // distinct amber
];
const OTHER_COLOR = "#c4c8cb"; // light grey for a winner outside the top 5 - lighter so top-5 colours read clearly
const NODATA_COLOR = "#d9d9d9";

const PALETTE_BY_CODE = new Map(DOMINANT_PALETTE.map((p) => [p.code, p.color]));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Opacity encodes predominance strength (the winner's share of the postcode's
// whole fleet) - the ArcGIS "predominance with an opacity variable" idea, done
// within our shared-layer pattern. Contested postcodes stay airy; decisive wins
// fill in solid.
//
// CRITICAL: the share domain must match where the data actually sits, or the map
// reads flat. In this dataset the winner's share is inherently narrow - every
// postcode has a long tail of makes, so the leader takes only ~10-31% (2025:
// p10=0.143, median=0.172, p90=0.219, p95=0.236, max=0.308; NOTHING exceeds
// 0.31). The previous fixed domain anchored the solid end at 0.45 - a value that
// never occurs - so the most decisive postcode in the state only reached ~62%
// opacity and the middle half (share 0.156-0.192) sat at a uniform 28-39%. That
// is why it looked like a flat faint wash with no strength variation.
//
// We now calibrate the ramp to the ACTUAL distribution on every render (p10 ->
// faint floor, p95 -> solid), the same approach SmartMapping's opacity creator
// uses, so the full faint->solid range is spent across the postcodes that exist.
// ALPHA_MIN is a legible floor (not near-invisible) so even contested winners
// keep their colour; ALPHA_MAX is fully solid for decisive leads.
export const ALPHA_MIN = 0.22;  // faint floor (p10 share) - still legible
export const ALPHA_MAX = 1.0;   // solid (p95 share) - decisive lead

/** The share values mapped to ALPHA_MIN..ALPHA_MAX, derived from the data. */
export interface StrengthDomain {
  loShare: number;  // share rendered at ALPHA_MIN (p10 of the distribution)
  hiShare: number;  // share rendered at ALPHA_MAX (p95 of the distribution)
}

/**
 * Computes the opacity-ramp domain from the actual winning-make share
 * distribution: p10 -> faint, p95 -> solid. Falls back to a sensible fixed band
 * if there are too few postcodes to take percentiles, and guards against a
 * degenerate (near-zero) spread.
 *
 * CRITICAL: the domain must be taken over only the postcodes that actually
 * RENDER (those with geometry). byPostcode also holds ~63 non-geometry postcodes
 * (PO boxes etc.) whose tiny fleets give a single make a very high share (p95
 * jumps from ~0.24 to ~0.44 if they are included). Since they never paint, those
 * outliers must not stretch the ramp - or the rendered map washes out again.
 */
function computeStrengthDomain(
  byPostcode: Map<string, DominantMake>,
  renderedPostcodes?: Set<string>
): StrengthDomain {
  const shares: number[] = [];
  for (const [pc, dm] of byPostcode) {
    if (dm.pcTotal <= 0) continue;
    if (renderedPostcodes && !renderedPostcodes.has(pc)) continue;
    shares.push(dm.share);
  }
  shares.sort((a, b) => a - b);
  if (shares.length < 10) return { loShare: 0.10, hiShare: 0.30 };
  const at = (p: number) => shares[Math.floor((p / 100) * (shares.length - 1))];
  const loShare = at(10);
  let hiShare = at(95);
  if (hiShare - loShare < 0.03) hiShare = loShare + 0.05; // keep a usable spread
  return { loShare, hiShare };
}

function colorForCode(code: string): string {
  return PALETTE_BY_CODE.get(code) ?? OTHER_COLOR;
}

/** One legend row: a make (or "Other") that wins at least one postcode. */
export interface DominantLegendItem {
  label: string;
  color: string;
  wins: number;
}

/**
 * Builds the POSTCODE-keyed renderer for the shared layer plus the legend rows
 * (only categories that actually win somewhere, ordered by postcode wins).
 *
 * Opacity encodes predominance strength and is BAKED INTO each symbol's fill
 * alpha (B-004 fix, 2026-06-10). An earlier version used a field-based opacity
 * visualVariable reading DOMINANT_SHARE, but the layer's internal feature store
 * never picks up direct attribute mutations (no applyEdits, hard rule #1), so on
 * a cold start the variable read 0 for every feature and the map was a flat wash.
 * removeAll+addMany didn't fix it either. Baking the alpha into the symbol
 * bypasses the store entirely - the renderer carries the opacity, not a field.
 */
export function buildDominantRenderer(
  byPostcode: Map<string, DominantMake>,
  renderedPostcodes?: Set<string>
): { renderer: UniqueValueRenderer; legend: DominantLegendItem[]; strength: StrengthDomain } {
  const strength = computeStrengthDomain(byPostcode, renderedPostcodes);
  const uniqueValueInfos = [];
  const winsByLabel = new Map<string, { color: string; wins: number }>();

  for (const [pc, dm] of byPostcode) {
    if (dm.pcTotal <= 0) continue;
    const inTop5 = PALETTE_BY_CODE.has(dm.makeCode);
    const color = colorForCode(dm.makeCode);
    const label = inTop5 ? (MAKE_LABELS[dm.makeCode] ?? dm.makeCode) : "Other make";
    const [r, g, b] = hexToRgb(color);

    // Linearly interpolate the alpha from the data-driven strength domain.
    // CRITICAL: the ArcGIS Color alpha channel is a 0-1 FLOAT, not 0-255.
    // Anything >= 1 clamps to fully opaque (the cause of the all-solid regression:
    // a previous version multiplied by 255, so every postcode clamped to solid).
    const t = strength.hiShare > strength.loShare
      ? Math.max(0, Math.min(1, (dm.share - strength.loShare) / (strength.hiShare - strength.loShare)))
      : 0.5;
    const alpha = ALPHA_MIN + t * (ALPHA_MAX - ALPHA_MIN);

    uniqueValueInfos.push({
      value: pc,
      symbol: new SimpleFillSymbol({ color: [r, g, b, alpha], outline: postcodeOutline() }),
    });

    const acc = winsByLabel.get(label) ?? { color, wins: 0 };
    acc.wins += 1;
    winsByLabel.set(label, acc);
  }

  const renderer = new UniqueValueRenderer({
    field: "POSTCODE",
    defaultSymbol: new SimpleFillSymbol({ color: [...hexToRgb(NODATA_COLOR), 160], outline: postcodeOutline() }),
    defaultLabel: "No data",
    uniqueValueInfos,
  });

  const order = [...DOMINANT_PALETTE.map((p) => p.label), "Other make"];
  const legend: DominantLegendItem[] = [...winsByLabel.entries()]
    .map(([label, v]) => ({ label, color: v.color, wins: v.wins }))
    .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));

  return { renderer, legend, strength };
}

/**
 * Builds a FRESH FeatureReductionCluster for the shared polygon layer on every call.
 *
 * When set on the layer, all features render as donut pie symbols at polygon
 * centroids. The pie slices show the summed make-count proportions; size is
 * proportional to the total registrations in the cluster.
 *
 * DELIBERATELY NOT CACHED (B-005 fix, 2026-06-10). The cluster aggregates the
 * per-make COUNT attributes, which DominantMakeView rewrites on every year change.
 * Direct attribute mutation (no applyEdits, per hard rule #1) does not notify the
 * cluster to re-aggregate; the SDK only recomputes when featureReduction is set to a
 * DIFFERENT object reference. A previous version cached a singleton "to avoid recompute
 * cost", so each year change reassigned the SAME reference - an Accessor no-op - and the
 * pies stayed frozen on the first year's data even though the source updated. Returning a
 * new instance forces the recompute (cheap: 7 sums over 694 features) so the pies track
 * the selected year.
 *
 * Aggregate field names (cluster_toyota etc.) are defined in the `fields` array
 * and referenced by the PieChartRenderer `attributes`.
 * Hard-rules: no applyEdits; no geometry re-fetch; fields already written to
 * graphic attributes by DominantMakeView before this reduction is applied.
 */
/** Top-5 fields used by the pie layer (Other excluded - E-016). */
export const PIE_FIELDS = [
  "TOYOTA_COUNT", "FORD_COUNT", "HOLDEN_COUNT", "MERC_COUNT", "HYUNDAI_COUNT",
] as const;

/**
 * Builds the make-breakdown popup content as a DOM node. Shared by both the cluster
 * popup (aggregate attributes prefixed "cluster_") and the individual-postcode popup
 * (raw attributes on the source point). Accepts a prefix so the same function works
 * for both, and an optional scope line.
 */
export function buildMakePopupContent(
  attrs: Record<string, number>,
  prefix: string,
  scopeText: string,
): HTMLDivElement {
  const toyota  = attrs[`${prefix}toyota`]  ?? 0;
  const ford    = attrs[`${prefix}ford`]    ?? 0;
  const holden  = attrs[`${prefix}holden`]  ?? 0;
  const merc    = attrs[`${prefix}merc`]    ?? 0;
  const hyundai = attrs[`${prefix}hyundai`] ?? 0;
  const top5 = toyota + ford + holden + merc + hyundai;
  const pct = (v: number) => top5 > 0 ? (v / top5 * 100).toFixed(1) + "%" : "-";
  const rows: [string, string, number][] = [
    ["Toyota",        "#EB0A1E", toyota],
    ["Ford",          "#00529B", ford],
    ["Holden",        "#00843D", holden],
    ["Mercedes-Benz", "#7D3C98", merc],
    ["Hyundai",       "#E69F00", hyundai],
  ];
  // Percentage leads (bold), raw count follows in a muted column (Simon's request).
  const tableRows = rows
    .map(([name, col, val]) =>
      `<tr>` +
      `<td style="padding:3px 0 3px 0;width:12px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${col}"></span></td>` +
      `<td style="padding:3px 10px 3px 6px;color:#333">${name}</td>` +
      `<td style="text-align:right;font-weight:600;padding:3px 0">${pct(val)}</td>` +
      `<td style="text-align:right;color:#888;font-size:12px;font-variant-numeric:tabular-nums;padding:3px 0 3px 12px">${val.toLocaleString()}</td>` +
      `</tr>`)
    .join("");
  const div = document.createElement("div");
  div.style.cssText = "font-size:13px;font-family:var(--font-sans),-apple-system,sans-serif";
  div.innerHTML =
    `<table style="border-collapse:collapse;width:100%">${tableRows}</table>` +
    `<div style="margin-top:8px;padding-top:6px;border-top:1px solid #eee;font-size:11px;color:#888">${scopeText}</div>`;
  return div;
}

export function buildPieClusterReduction(): FeatureReductionCluster {
  const pieRenderer = new PieChartRenderer({
    // Top-5 only (Other dropped per E-016) so year-to-year and geographic variation
    // in the make mix actually reads on the donut. The popup still shows the full
    // percentage table. PieChartRenderer renormalises the slices to sum to 100% of
    // the top-5 total automatically.
    attributes: [
      { field: "cluster_toyota",  color: [235, 10,  30],  label: "Toyota"        },
      { field: "cluster_ford",    color: [0,   82,  155], label: "Ford"          },
      { field: "cluster_holden",  color: [0,   132, 61],  label: "Holden"        },
      { field: "cluster_merc",    color: [125, 60,  152], label: "Mercedes-Benz" },
      { field: "cluster_hyundai", color: [230, 159, 0],   label: "Hyundai"       },
    ],
    holePercentage: 0.40,
    outline: new SimpleLineSymbol({ color: [255, 255, 255, 200], width: 1.5 }),
    visualVariables: [{
      type: "size",
      field: "cluster_total",
      minSize: 20,
      maxSize: 34,
      minDataValue: 5000,
      maxDataValue: 500000,
    }] as any,
  });

  const clusterTitleExpr = `IIF($feature.cluster_count == 1, "Make mix: 1 postcode", "Make mix: " + Text($feature.cluster_count) + " postcodes")`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildClusterContent = (event: { graphic: { attributes: Record<string, any> } }) => {
    const a = event.graphic.attributes as Record<string, number>;
    const scope = (a.cluster_count ?? 1) > 1
      ? `${(a.cluster_total ?? 0).toLocaleString()} registrations across ${a.cluster_count} postcodes`
      : `${(a.cluster_total ?? 0).toLocaleString()} registrations`;
    return buildMakePopupContent(a, "cluster_", scope);
  };

  const clusterPopupTemplate = {
    expressionInfos: [{ name: "title", expression: clusterTitleExpr }],
    title: "{expression/title}",
    content: buildClusterContent,
  };

  return new FeatureReductionCluster({
    clusterRadius: 70,
    clusterMinSize: 20,
    clusterMaxSize: 34,
    renderer: pieRenderer,
    fields: [
      { name: "cluster_toyota",  alias: "Toyota",        onStatisticField: "TOYOTA_COUNT",  statisticType: "sum" },
      { name: "cluster_ford",    alias: "Ford",          onStatisticField: "FORD_COUNT",    statisticType: "sum" },
      { name: "cluster_holden",  alias: "Holden",        onStatisticField: "HOLDEN_COUNT",  statisticType: "sum" },
      { name: "cluster_merc",    alias: "Mercedes-Benz", onStatisticField: "MERC_COUNT",    statisticType: "sum" },
      { name: "cluster_hyundai", alias: "Hyundai",       onStatisticField: "HYUNDAI_COUNT", statisticType: "sum" },
      { name: "cluster_total",   alias: "Total",         onStatisticField: "TOTAL_COUNT",   statisticType: "sum" },
    ] as any,
    popupTemplate: clusterPopupTemplate as any,
  });
}
