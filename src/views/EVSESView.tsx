/**
 * "EV Advantage" bivariate preset: electric-vehicle ownership against
 * socio-economic advantage (ABS SEIFA IRSAD).
 *
 * Renderer: manual 3x3 UniqueValueRenderer (keyed on POSTCODE) on the shared
 * layer. SmartMapping's relationship renderer needs a server-backed layer for
 * its statistics pipeline; ours is in-memory, so we compute tertiles manually.
 *
 * Chart: ECharts scatter (EV% vs SEIFA), coloured by bivariate class, linked to
 * the map: hovering a point highlights the postcode, clicking it zooms there. By
 * default the scatter shows only postcodes within the current map extent and
 * updates as the map moves; a small toggle disables that to show all postcodes.
 */
import { useEffect, useMemo, useState } from "react";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView";
import type Graphic from "@arcgis/core/Graphic";
import type MapView from "@arcgis/core/views/MapView";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

import { computeEVPercent } from "../engine/evPercent";
import {
  classifyBivariate,
  buildBivariateRenderer,
  getBivariateBreaks,
  BIVARIATE_COLORS,
} from "../engine/bivariate";
import { getYearData } from "../engine/loadData";
import type { DataStore } from "../engine/loadData";

import { BivariateLegend } from "../components/BivariateLegend";
import { EVSESScatter } from "../components/EVSESScatter";
import type { ScatterPoint } from "../components/EVSESScatter";
import { YearSelect } from "../components/YearSelect";

// Build scatter colour map from the BIVARIATE_COLORS matrix so scatter and map match exactly.
function buildClassColors(): Map<string, string> {
  const map = new Map<string, string>();
  for (let evClass = 0; evClass < 3; evClass++) {
    for (let sesClass = 0; sesClass < 3; sesClass++) {
      map.set(String(evClass * 3 + sesClass), BIVARIATE_COLORS[evClass][sesClass]);
    }
  }
  return map;
}

const CLASS_COLORS = buildClassColors();
// 1/3 of the viewport so the map gets 2/3 - enough scatter context without
// crowding the choropleth. Floor 300px (usable minimum for axis + labels + dots),
// ceiling 680px (prevents dominance on ultrawide monitors).
// Mobile (<768px): the side panel collapses to a bottom sheet - deferred to E-007.
const CHART_WIDTH = "clamp(300px, 33.33vw, 680px)";

interface Props {
  view: MapView;
  layer: FeatureLayer;
  graphicsByPostcode: Map<string, Graphic>;
  allPostcodes: string[];
  seifaByPostcode: Map<string, number>;
  dataStore: DataStore;
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
}

export function EVSESView({
  view, layer, graphicsByPostcode, allPostcodes, seifaByPostcode, dataStore,
  year, years, onYearChange,
}: Props) {
  const [ready,           setReady]           = useState(false);
  // Latches true after the first successful load and never resets. Panels mount
  // on this, not on `ready`, so a year change (which flips `ready` off briefly)
  // never unmounts the scatter - that unmount/remount was the playback flash.
  const [hasLoaded,       setHasLoaded]       = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [scatterPoints,   setScatterPoints]   = useState<ScatterPoint[]>([]);
  const [breaks,          setBreaks]          = useState<{ evT1: number; evT2: number; sesT1: number; sesT2: number } | null>(null);
  const [showChart,       setShowChart]       = useState(true);
  const [hoveredPostcode, setHoveredPostcode] = useState<string | null>(null);
  const [extentOnly,      setExtentOnly]      = useState(true);
  const [visibleSet,      setVisibleSet]      = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    async function run() {
      try {
        const yearData = await getYearData(dataStore, year);
        if (cancelled) return;

        const { evPercent } = computeEVPercent(dataStore.meta, yearData);
        const classMap = classifyBivariate(evPercent, seifaByPostcode, allPostcodes);

        layer.renderer = buildBivariateRenderer(classMap);

        layer.popupTemplate = {
          title: "Postcode {POSTCODE}",
          content: (feature: { graphic: Graphic }) => {
            const pc  = feature.graphic.attributes.POSTCODE as string;
            const ev  = evPercent.get(pc);
            const ses = seifaByPostcode.get(pc);
            const cls = classMap.get(pc) ?? -1;
            const clsLabel = cls >= 0
              ? `${["Low","Mid","High"][Math.floor(cls / 3)]} EV · ${["Low","Mid","High"][cls % 3]} SES`
              : "No data";
            return `<div style="font-family:-apple-system,sans-serif;font-size:13px;padding:2px 0">
              <div><strong>EV ownership:</strong> ${ev !== undefined ? ev.toFixed(1) + "%" : "No data"}</div>
              <div><strong>Socio-economic advantage:</strong> ${ses !== undefined ? ses + " (national percentile)" : "No data"}</div>
              <div style="color:#666;font-size:11px;margin-top:4px">${clsLabel}</div>
            </div>`;
          },
        };

        const b = getBivariateBreaks(evPercent, seifaByPostcode, allPostcodes);
        setBreaks(b);
        const points: ScatterPoint[] = [];
        for (const pc of allPostcodes) {
          const ev  = evPercent.get(pc);
          const ses = seifaByPostcode.get(pc);
          const cls = classMap.get(pc);
          if (ev === undefined || ses === undefined || cls === undefined || cls < 0) continue;
          // Drop anything sitting on either axis (0% EV or 0 SES) - it clusters on
          // the edges and adds noise rather than signal.
          if (ev === 0 || ses === 0) continue;
          points.push({ postcode: pc, evPercent: ev, seifa: ses, classIndex: cls });
        }
        setScatterPoints(points);
        setReady(true);
        setHasLoaded(true);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Hovering a scatter point highlights the matching postcode on the map.
  useEffect(() => {
    if (!hoveredPostcode) return;
    const g = graphicsByPostcode.get(hoveredPostcode);
    if (!g) return;
    let cancelled = false;
    let handle: { remove(): void } | undefined;
    view.whenLayerView(layer).then((lv) => {
      if (cancelled) return;
      handle = lv.highlight(g.attributes.ObjectID as number);
    });
    return () => { cancelled = true; handle?.remove(); };
  }, [hoveredPostcode, view, layer, graphicsByPostcode]);

  // Track which postcodes fall in the current map extent. We query the layer view
  // (it reprojects and does a true polygon intersect) rather than comparing
  // extents ourselves, which would break on a spatial-reference mismatch.
  // Recomputed when the map settles (view.stationary).
  useEffect(() => {
    if (!hasLoaded || !extentOnly) { setVisibleSet(null); return; }
    let cancelled = false;
    let lv: FeatureLayerView | undefined;
    const compute = async () => {
      lv = lv ?? (await view.whenLayerView(layer)) as FeatureLayerView;
      if (cancelled || !view.extent) return;
      const res = await lv.queryFeatures({
        geometry: view.extent,
        spatialRelationship: "intersects",
        outFields: ["POSTCODE"],
        returnGeometry: false,
      });
      if (cancelled) return;
      setVisibleSet(new Set(res.features.map((f) => f.attributes.POSTCODE as string)));
    };
    compute();
    const h = reactiveUtils.watch(() => view.stationary, (stationary) => { if (stationary) compute(); });
    return () => { cancelled = true; h.remove(); };
  }, [hasLoaded, extentOnly, view, layer]);

  const displayedPoints = useMemo(
    () => (extentOnly && visibleSet ? scatterPoints.filter((p) => visibleSet.has(p.postcode)) : scatterPoints),
    [extentOnly, visibleSet, scatterPoints]
  );

  // Clicking a scatter point zooms the map to that postcode (a little wider than
  // its extent so it sits in context).
  function handleSelect(pc: string) {
    const g = graphicsByPostcode.get(pc);
    const ext = g?.geometry?.extent;
    if (!ext) return;
    setHoveredPostcode(pc);
    view.goTo({ target: ext.clone().expand(2.2) }, { duration: 600 }).catch(() => { /* interrupted */ });
  }

  if (error) {
    return (
      <div style={{
        position: "absolute", top: 88, left: 12, zIndex: 20,
        background: "var(--color-surface)", padding: 16,
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)",
        color: "var(--color-error)", fontFamily: "var(--font-sans)",
      }}>
        {error}
      </div>
    );
  }

  return (
    <>
      {/* Context strip - Row 2 position */}
      <div style={{
        position: "absolute", top: 40, left: 0, right: 0, zIndex: 20,
        height: 48, background: "var(--color-navy)",
        display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
        fontFamily: "var(--font-sans)", fontSize: 12, color: "rgba(255,255,255,0.8)",
        borderTop: "1px solid rgba(255,255,255,0.12)",
      }}>
        <YearSelect years={years} value={year} onChange={onYearChange} />
        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.18)" }} />
        <span style={{ color: "#fff", fontWeight: 600 }}>
          EV advantage: ownership vs socio-economic status
        </span>
        {!ready && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
            background: "var(--color-focus)", animation: "busyPulse 1.1s ease-in-out infinite",
          }} />
        )}
      </div>

      {/* Bivariate legend */}
      {hasLoaded && breaks && (
        <BivariateLegend
          evT1={breaks.evT1}
          evT2={breaks.evT2}
          sesT1={breaks.sesT1}
          sesT2={breaks.sesT2}
        />
      )}

      {/* Collapsed state: a tab on the right edge pulls the panel back out */}
      {hasLoaded && !showChart && (
        <button
          onClick={() => setShowChart(true)}
          title="Show chart"
          style={{
            position: "absolute", top: 96, right: 0, zIndex: 16,
            display: "flex", alignItems: "center", gap: 6,
            height: 36, padding: "0 14px 0 12px",
            border: "1px solid var(--color-border)", borderRight: "none",
            borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
            background: "var(--color-surface)", color: "var(--color-text)",
            fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", boxShadow: "var(--shadow-md)",
          }}
        >
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>‹</span> Chart
        </button>
      )}

      {/* Scatter chart panel */}
      {hasLoaded && showChart && (
        <div style={{
          position: "absolute", top: 88, right: 0, bottom: 0, width: CHART_WIDTH,
          zIndex: 15, background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          display: "flex", flexDirection: "column",
          boxShadow: "var(--shadow-md)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "4px 6px 4px 14px",
            borderBottom: "1px solid var(--color-border)",
          }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, flex: 1 }}>
              EV ownership % vs socio-economic advantage
            </span>
            {/* Subtle toggle: sync the scatter to the current map extent */}
            <button
              onClick={() => setExtentOnly((v) => !v)}
              title={extentOnly ? "Showing postcodes in view; click to show all" : "Showing all postcodes; click to sync to map"}
              aria-label="Sync chart to map extent"
              aria-pressed={extentOnly}
              style={{
                height: 28, width: 28, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${extentOnly ? "var(--color-navy)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-sm)",
                background: extentOnly ? "var(--color-navy)" : "transparent",
                color: extentOnly ? "#fff" : "var(--color-text-subtle)",
                cursor: "pointer", lineHeight: 0,
              }}
            >
              {/* viewfinder / crop-to-extent glyph */}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3" />
                <circle cx="8" cy="8" r="2.2" />
              </svg>
            </button>
            <button
              onClick={() => setShowChart(false)}
              title="Hide chart"
              aria-label="Hide chart"
              style={{
                height: 28, width: 28, display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
                background: "transparent", color: "var(--color-text-subtle)",
                cursor: "pointer", fontSize: 15, lineHeight: 1,
              }}
            >
              ›
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <EVSESScatter
              points={displayedPoints}
              classColors={CLASS_COLORS}
              highlightPostcode={hoveredPostcode ?? undefined}
              onHover={setHoveredPostcode}
              onSelect={handleSelect}
            />
          </div>
          <div style={{
            padding: "6px 14px", fontFamily: "var(--font-sans)", fontSize: 10,
            color: "var(--color-text-subtle)", borderTop: "1px solid var(--color-border)",
          }}>
            {extentOnly
              ? `${displayedPoints.length} of ${scatterPoints.length} postcodes in view`
              : `${scatterPoints.length} postcodes`}
            {" "}· hover to highlight · click to zoom
          </div>
        </div>
      )}
    </>
  );
}
