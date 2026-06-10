import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Polyline from "@arcgis/core/geometry/Polyline";
import type Polygon from "@arcgis/core/geometry/Polygon";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import { executeQueryJSON } from "@arcgis/core/rest/query";
import { postcodeOutline, STATE_BORDER_COLOR, STATE_BORDER_WIDTH } from "./mapStyle";

const GEOMETRY_URL =
  "https://services1.arcgis.com/vHnIGBHHqDR6y0CR/ArcGIS/rest/services/VicRegos/FeatureServer/0";

// Official Victorian state boundary: ABS ASGS 2021 State/Territory layer.
const STATE_BOUNDARY_URL =
  "https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/STE/MapServer/1";

// Neutral grey shown before any filter is applied, and for postcodes with no matching data.
// Alpha 190 (~75% opaque) keeps the basemap faintly visible underneath.
const INITIAL_RENDERER = new SimpleRenderer({
  symbol: new SimpleFillSymbol({ color: [210, 210, 210, 190], outline: postcodeOutline() }),
});

export interface GeometryStore {
  layer: FeatureLayer;
  /** Dissolved outline of all postcodes = the Victorian state border. */
  boundaryLayer: GraphicsLayer;
  graphicsByPostcode: Map<string, Graphic>;
  /** SEIFA IRSAD percentile (0-99, national) keyed by POSTCODE. */
  seifaByPostcode: Map<string, number>;
  /** ABS occupied private dwellings (households) keyed by POSTCODE. null where the Census did not match. */
  householdsByPostcode: Map<string, number>;
}

/**
 * Fetches the 694 Victorian postcode polygons once on startup.
 *
 * NO maxAllowableOffset (full resolution). The source layer has now been
 * topologically generalised (~20m) and republished (BACKLOG E-002), so we no
 * longer simplify client-side. Any non-zero offset simplifies each polygon
 * INDEPENDENTLY (non-topological), which breaks shared edges and reintroduces
 * the gaps/overlaps and coarseness; it also no longer buys much, because the
 * source already sits near that resolution.
 *
 * Measured against the republished source (694 features, gzipped over the wire):
 * offset 0 = 1.29 MB clean topology; offset 30 = 658 KB but with edge artefacts.
 * The ~630 KB saving is not worth shipping broken borders, and this is a
 * one-time load that is never re-fetched on filter/view change (hard rule #3).
 *
 * Returns a client-side FeatureLayer (source: in-memory graphics), the
 * state-boundary GraphicsLayer, and a Map<POSTCODE, Graphic> for fast lookups.
 */
export async function loadGeometry(): Promise<GeometryStore> {
  const featureSet = await executeQueryJSON(GEOMETRY_URL, {
    where: "1=1",
    // ABS_POP_TOTAL / ABS_Households_Total ride along with the one-time geometry
    // load (no extra request, no re-fetch on filter change). Households is the
    // denominator for the Explore per-household metric.
    outFields: ["POSTCODE", "irsad_percentile", "ABS_POP_TOTAL", "ABS_Households_Total"],
    returnGeometry: true,
  });

  const graphics: Graphic[] = [];
  const graphicsByPostcode = new Map<string, Graphic>();
  const seifaByPostcode    = new Map<string, number>();
  const householdsByPostcode = new Map<string, number>();

  featureSet.features.forEach((feature, i) => {
    const postcode   = feature.attributes.POSTCODE as string;
    const seifa      = feature.attributes.irsad_percentile as number ?? null;
    const population = feature.attributes.ABS_POP_TOTAL as number ?? null;
    // Treat 0 households as "no data" (a real postcode always has dwellings; 0
    // means the Census did not match), so it never becomes a divide-by-zero.
    const rawHh      = feature.attributes.ABS_Households_Total as number ?? null;
    const households = rawHh != null && rawHh > 0 ? rawHh : null;

    const g = new Graphic({
      geometry: feature.geometry,
      attributes: {
        ObjectID: i + 1,
        POSTCODE: postcode,
        irsad_percentile: seifa,
        ABS_POP_TOTAL: population,
        ABS_Households_Total: households,
        // Pre-initialised to 0; DominantMakeView sets the real values when active.
        DOMINANT_SHARE: 0,
        TOYOTA_COUNT:  0,
        FORD_COUNT:    0,
        HOLDEN_COUNT:  0,
        MERC_COUNT:    0,
        HYUNDAI_COUNT: 0,
        OTHER_COUNT:   0,
        TOTAL_COUNT:   0,
      },
    });
    graphics.push(g);
    graphicsByPostcode.set(postcode, g);
    if (seifa != null) seifaByPostcode.set(postcode, seifa);
    if (households != null) householdsByPostcode.set(postcode, households);
  });

  const layer = new FeatureLayer({
    source: graphics,
    objectIdField: "ObjectID",
    fields: [
      { name: "ObjectID",             type: "oid" },
      { name: "POSTCODE",             alias: "Postcode",                         type: "string"  },
      { name: "irsad_percentile",     alias: "Socio-economic advantage (IRSAD)", type: "integer" },
      { name: "ABS_POP_TOTAL",        alias: "Population (ABS)",                 type: "integer" },
      { name: "ABS_Households_Total", alias: "Households (ABS)",                 type: "integer" },
      // Winning-make share (0-1); written by DominantMakeView, read by its opacity visualVariable.
      { name: "DOMINANT_SHARE",      alias: "Dominant make share",              type: "double"  },
      // Per-make registration counts; written by DominantMakeView for pie-chart cluster mode.
      { name: "TOYOTA_COUNT",  alias: "Toyota registrations",        type: "double" },
      { name: "FORD_COUNT",    alias: "Ford registrations",          type: "double" },
      { name: "HOLDEN_COUNT",  alias: "Holden registrations",        type: "double" },
      { name: "MERC_COUNT",    alias: "Mercedes-Benz registrations", type: "double" },
      { name: "HYUNDAI_COUNT", alias: "Hyundai registrations",       type: "double" },
      { name: "OTHER_COUNT",   alias: "Other makes registrations",   type: "double" },
      { name: "TOTAL_COUNT",   alias: "Total registrations",         type: "double" },
    ],
    renderer: INITIAL_RENDERER,
    // Popup content will be enriched in Phase 3 to show the filtered total.
    popupTemplate: {
      title: "Postcode {POSTCODE}",
      content: "Select a filter to see registration counts.",
    },
  });

  console.log(
    `[loadGeometry] Loaded ${graphics.length} postcode polygons, ` +
    `${seifaByPostcode.size} with SEIFA IRSAD, ${householdsByPostcode.size} with ABS households ` +
    `(full resolution, no client offset)`
  );

  const boundaryLayer = await buildBoundaryLayer();

  return { layer, boundaryLayer, graphicsByPostcode, seifaByPostcode, householdsByPostcode };
}

/**
 * Loads the official Victorian state border from the ABS ASGS 2021 service (a
 * one-time fetch, not the per-filter postcode geometry, so regression guard #3 is
 * untouched). Generalised with maxAllowableOffset=50 (~220 KB; 500 m was too coarse
 * for the intricate VIC coastline - saw-tooth artefacts at Corner Inlet etc.).
 * Rendered as a polyline so the interior never
 * intercepts clicks meant for the choropleth beneath, and excluded from
 * legends/popups (GraphicsLayer, no popupTemplate, listMode "hide"). Failure is
 * non-fatal: an empty layer is returned and the app still runs.
 */
async function buildBoundaryLayer(): Promise<GraphicsLayer> {
  const layer = new GraphicsLayer({ listMode: "hide", title: "Victoria boundary" });
  try {
    const fs = await executeQueryJSON(STATE_BOUNDARY_URL, {
      where: "state_name_2021 = 'Victoria'",
      returnGeometry: true,
      outFields: [],
      maxAllowableOffset: 50,
      outSpatialReference: { wkid: 102100 },
    });
    for (const f of fs.features) {
      const poly = f.geometry as Polygon;
      if (!poly?.rings) continue;
      const outline = new Polyline({ paths: poly.rings, spatialReference: poly.spatialReference });
      layer.add(new Graphic({
        geometry: outline,
        symbol: new SimpleLineSymbol({ color: [...STATE_BORDER_COLOR], width: STATE_BORDER_WIDTH }),
      }));
    }
    console.log(`[loadGeometry] State boundary loaded from ABS ASGS2021 (${fs.features.length} feature[s])`);
  } catch (err) {
    console.warn("[loadGeometry] Could not load state boundary:", err);
  }
  return layer;
}
