/**
 * "New vs Old" - share of each postcode's fleet manufactured 2020 or later.
 * Renders like the other choropleth presets: a UniqueValueRenderer keyed on
 * POSTCODE, swapped onto the SHARED layer (no dedicated layer, no re-tessellation,
 * extent preserved). Fixed 6-class ColorBrewer RdYlGn symbology matching the
 * original static map. Extent-filtered ranked table on the right.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView";
import type Graphic from "@arcgis/core/Graphic";
import type MapView from "@arcgis/core/views/MapView";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

import { getYearData } from "../engine/loadData";
import type { DataStore } from "../engine/loadData";
import {
  loadVehicleAge,
  computeAgeProfiles,
  buildAgeRendererByPostcode,
  thresholdForYear,
  classIndex,
  RDYLGN_6,
  CLASS_LABELS,
  type AgeProfile,
} from "../engine/vehicleAge";
import { quartersForYear } from "../engine/perHousehold";
import { YearSelect } from "../components/YearSelect";

interface Props {
  layer: FeatureLayer;
  dataStore: DataStore;
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
  view: MapView;
  householdsByPostcode: Map<string, number>;
  graphicsByPostcode: Map<string, Graphic>;
}

interface TableRow {
  pc: string;
  pctNew: number;
  newRecs: number;
  totalRecs: number;
  vehPerHH: string | null;
}

export function NewVsOldView({
  layer, dataStore, year, years, onYearChange,
  view, householdsByPostcode, graphicsByPostcode,
}: Props) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateNew, setStateNew] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number>(2020);
  const [profiles, setProfiles] = useState<Map<string, AgeProfile>>(new Map());
  const [showTable, setShowTable] = useState(true);
  const [extentOnly, setExtentOnly] = useState(true);
  const [visiblePostcodes, setVisiblePostcodes] = useState<Set<string> | null>(null);
  const [selectedPostcode, setSelectedPostcode] = useState<string | null>(null);
  const highlightHandleRef = useRef<{ remove(): void } | null>(null);

  // Load age data, apply renderer
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    async function run() {
      try {
        await getYearData(dataStore, year);
        const ageData = await loadVehicleAge(year);
        if (cancelled) return;

        const thresh = thresholdForYear(ageData);
        const profs = computeAgeProfiles(ageData, dataStore.meta);

        let n = 0, k = 0;
        for (const p of profs.values()) { n += p.newRecs; k += p.knownRecs; }
        setStateNew(k > 0 ? (n / k) * 100 : null);
        setThreshold(thresh);

        const { renderer } = buildAgeRendererByPostcode(profs);
        layer.renderer = renderer;
        layer.popupTemplate = buildPopup(profs, thresh);
        setProfiles(profs);
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Track postcodes visible in the current map extent - only when extentOnly is on.
  // When off, null means "all postcodes" and the table shows all 694.
  useEffect(() => {
    if (!ready || !extentOnly) { setVisiblePostcodes(null); return; }
    let cancelled = false;
    let lv: FeatureLayerView | undefined;

    const compute = async () => {
      lv = lv ?? (await view.whenLayerView(layer)) as FeatureLayerView;
      if (cancelled) return;
      if (lv.updating) await reactiveUtils.whenOnce(() => !lv!.updating);
      if (cancelled || !view.extent) return;
      const res = await lv.queryFeatures({
        geometry: view.extent,
        spatialRelationship: "intersects",
        outFields: ["POSTCODE"],
        returnGeometry: false,
      });
      if (cancelled) return;
      setVisiblePostcodes(new Set(res.features.map((f) => f.attributes.POSTCODE as string)));
    };

    const h = reactiveUtils.watch(
      () => view.stationary,
      (s) => { if (s) compute(); },
      { initial: true }
    );
    return () => { cancelled = true; h.remove(); };
  }, [ready, extentOnly, view, layer]);

  // Highlight the table row for the postcode clicked on the map.
  useEffect(() => {
    const h = view.on("click", async (evt: Parameters<typeof view.hitTest>[0]) => {
      const res = await view.hitTest(evt, { include: [layer] });
      const hit = res.results[0];
      if (hit?.type === "graphic") {
        setSelectedPostcode(hit.graphic.attributes.POSTCODE as string ?? null);
      } else {
        setSelectedPostcode(null);
      }
    });
    return () => h.remove();
  }, [view, layer]);

  // Highlight the selected postcode polygon, matching the EV scatter hover pattern.
  useEffect(() => {
    highlightHandleRef.current?.remove();
    highlightHandleRef.current = null;
    if (!selectedPostcode) return;
    const g = graphicsByPostcode.get(selectedPostcode);
    if (!g) return;
    let cancelled = false;
    view.whenLayerView(layer).then((lv) => {
      if (cancelled) return;
      highlightHandleRef.current = lv.highlight(g.attributes.ObjectID as number);
    });
    return () => {
      cancelled = true;
      highlightHandleRef.current?.remove();
      highlightHandleRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPostcode]);

  const quarters = quartersForYear(year);

  // Build sorted table rows: visible postcodes, sorted by pctNew desc, capped at 25.
  const tableRows = useMemo((): TableRow[] => {
    if (!ready || profiles.size === 0) return [];
    const rows: TableRow[] = [];
    for (const [pc, p] of profiles) {
      if (visiblePostcodes && !visiblePostcodes.has(pc)) continue;
      if (p.knownRecs <= 0) continue;
      const hh = householdsByPostcode.get(pc) ?? null;
      const vehPerHH = hh != null && hh > 0
        ? (p.totalRecs / quarters / hh).toFixed(2)
        : null;
      rows.push({ pc, pctNew: p.pctNew, newRecs: p.newRecs, totalRecs: p.totalRecs, vehPerHH });
    }
    return rows.sort((a, b) => b.pctNew - a.pctNew).slice(0, 25);
  }, [ready, profiles, visiblePostcodes, householdsByPostcode, quarters]);

  // Click a table row: zoom to that postcode and select it.
  const handleRowClick = useCallback((pc: string) => {
    const g = graphicsByPostcode.get(pc);
    if (g?.geometry?.extent) view.goTo(g.geometry.extent.expand(2), { duration: 500 });
    setSelectedPostcode(pc);
  }, [view, graphicsByPostcode]);

  const headline = stateNew != null
    ? `${stateNew.toFixed(1)}% of Victorian registrations were made ${threshold} or later (last 5 years)`
    : "";

  const scopeLabel = extentOnly && visiblePostcodes
    ? `${tableRows.length} postcode${tableRows.length !== 1 ? "s" : ""} in view`
    : `Top ${tableRows.length} of all postcodes`;

  return (
    <>
      {/* Row 2 context strip */}
      <div style={STRIP}>
        <YearSelect years={years} value={year} onChange={onYearChange} />
        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.18)" }} />
        <span style={{ color: "#fff", fontWeight: 600 }}>New vs Old: registrations by manufacture era</span>
        {headline && <span style={{ opacity: 0.75, fontSize: 11 }}>{headline}</span>}
        {error && <span style={{ color: "#ffb4b4", fontSize: 11 }}>{error}</span>}
        {!ready && !error && <div style={BUSY} />}
      </div>

      {/* Legend - bottom left, fixed 6 classes */}
      {ready && (
        <div style={LEGEND_BOX}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>% made {threshold} or later</div>
          {CLASS_LABELS.map((label, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{
                width: 14, height: 10, borderRadius: 2, flexShrink: 0,
                background: `rgb(${RDYLGN_6[i].join(",")})`,
                border: "1px solid rgba(0,0,0,0.08)",
              }} />
              <span>{label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span style={{
              width: 14, height: 10, borderRadius: 2, flexShrink: 0,
              background: "#d9d9d9", border: "1px solid var(--color-border)",
            }} />
            <span style={{ color: "var(--color-text-subtle)" }}>No data</span>
          </div>
          <div style={LEGEND_FOOT}>
            "Last 5 years" = made {threshold} or later. Fixed breaks.
            Unknown manufacture year excluded from denominator.
          </div>
        </div>
      )}

      {/* Table panel - collapsed: tab on right edge; expanded: full-height side panel */}
      {ready && !showTable && (
        <button
          onClick={() => setShowTable(true)}
          title="Show table"
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
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>‹</span> Table
        </button>
      )}

      {ready && showTable && (
        <div style={TABLE_PANEL}>
          {/* Panel header: title + extent toggle + collapse */}
          <div style={TABLE_HEADER}>
            <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>
              {scopeLabel} by % new
            </span>
            {/* Extent-only toggle - same viewfinder icon as EV scatter */}
            <button
              onClick={() => setExtentOnly((v) => !v)}
              title={extentOnly ? "Showing postcodes in view — click to show all" : "Showing all postcodes — click to sync to map"}
              aria-label="Sync table to map extent"
              aria-pressed={extentOnly}
              style={{
                height: 28, width: 28, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${extentOnly ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)"}`,
                borderRadius: "var(--radius-sm)",
                background: extentOnly ? "rgba(255,255,255,0.18)" : "transparent",
                color: extentOnly ? "#fff" : "rgba(255,255,255,0.5)",
                cursor: "pointer", lineHeight: 0, marginRight: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3" />
                <circle cx="8" cy="8" r="2.2" />
              </svg>
            </button>
            <button
              onClick={() => setShowTable(false)}
              title="Hide table"
              aria-label="Hide table"
              style={{
                height: 28, width: 28, display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.25)", borderRadius: "var(--radius-sm)",
                background: "transparent", color: "rgba(255,255,255,0.7)",
                cursor: "pointer", fontSize: 15, lineHeight: 1,
              }}
            >
              ›
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <table style={TABLE_STYLE}>
              <thead>
                <tr>
                  {["Postcode", "% New", "New", "Total", "Veh/HH"].map((h) => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, idx) => {
                  const ci = classIndex(row.pctNew);
                  const [r, g, b] = RDYLGN_6[ci];
                  return (
                    <tr
                      key={row.pc}
                      onClick={() => handleRowClick(row.pc)}
                      style={{
                        cursor: "pointer",
                        background: row.pc === selectedPostcode
                          ? "var(--color-focus-subtle, rgba(0,80,180,0.12))"
                          : idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.025)",
                      }}
                    >
                      <td style={TD}>{row.pc}</td>
                      {/* % New cell: left-border swatch coloured to match the map legend class */}
                      <td style={{
                        ...TD, textAlign: "right", fontWeight: 600,
                        boxShadow: `inset 3px 0 0 rgb(${r},${g},${b})`,
                        paddingLeft: 10,
                      }}>
                        {row.pctNew.toFixed(1)}%
                      </td>
                      <td style={{ ...TD, textAlign: "right" }}>
                        {row.newRecs.toLocaleString()}
                      </td>
                      <td style={{ ...TD, textAlign: "right" }}>
                        {row.totalRecs.toLocaleString()}
                      </td>
                      <td style={{ ...TD, textAlign: "right", color: "var(--color-text-subtle)" }}>
                        {row.vehPerHH ?? "N/A"}
                      </td>
                    </tr>
                  );
                })}
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...TD, textAlign: "center", color: "var(--color-text-subtle)", padding: "12px 0" }}>
                      No postcodes in current view
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{
            padding: "6px 14px", fontFamily: "var(--font-sans)", fontSize: 10,
            color: "var(--color-text-subtle)", borderTop: "1px solid var(--color-border)",
          }}>
            {extentOnly
              ? `${tableRows.length} of 694 postcodes in view`
              : `${tableRows.length} of 694 postcodes`}
            {" "}· click row to zoom + highlight
          </div>
        </div>
      )}
    </>
  );
}

/** Popup keyed on POSTCODE, reading the precomputed age profiles. */
function buildPopup(profiles: Map<string, AgeProfile>, threshold: number) {
  // The "d2010s" bucket spans 2010 to threshold-1; "new_recent" spans threshold+.
  // For the legacy 2020 threshold these labels match the old hardcoded values exactly.
  const midLabel = `2010–${threshold - 1}`;
  const recentLabel = `${threshold} or later`;
  return {
    title: "Postcode {POSTCODE}",
    content: (feature: { graphic: Graphic }) => {
      const pc = feature.graphic.attributes.POSTCODE as string;
      const p = profiles.get(pc);
      if (!p || p.knownRecs <= 0) {
        return `<div style="font-family:-apple-system,sans-serif;font-size:13px">No manufacture-year data for this postcode.</div>`;
      }
      const row = (label: string, v: number) =>
        `<tr><td style="padding:1px 8px 1px 0;color:#555">${label}</td><td style="text-align:right">${v.toLocaleString()}</td></tr>`;
      return `<div style="font-family:-apple-system,sans-serif;font-size:13px;padding:2px 0">
        <div><strong style="font-size:15px">${p.pctNew.toFixed(1)}%</strong> made ${recentLabel}</div>
        <div style="color:#555;margin:3px 0 6px">${p.newRecs.toLocaleString()} of ${p.knownRecs.toLocaleString()} known-age records</div>
        <table style="font-size:12px;border-collapse:collapse">
          ${row("Pre-2000", p.buckets[1] ?? 0)}
          ${row("2000–2009", p.buckets[2] ?? 0)}
          ${row(midLabel, p.buckets[3] ?? 0)}
          ${row(recentLabel, p.buckets[4] ?? 0)}
        </table>
      </div>`;
    },
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STRIP: React.CSSProperties = {
  position: "absolute", top: 40, left: 0, right: 0, zIndex: 20,
  height: 48, background: "var(--color-navy)",
  display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
  fontFamily: "var(--font-sans)", fontSize: 12, color: "rgba(255,255,255,0.8)",
  borderTop: "1px solid rgba(255,255,255,0.12)",
};

const BUSY: React.CSSProperties = {
  position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
  background: "var(--color-focus)", animation: "busyPulse 1.1s ease-in-out infinite",
};

const LEGEND_BOX: React.CSSProperties = {
  position: "absolute", bottom: 32, left: 12, zIndex: 10,
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)", padding: "12px 14px", minWidth: 160,
  boxShadow: "var(--shadow-md)", fontFamily: "var(--font-sans)", fontSize: 12,
  color: "var(--color-text)",
};

const LEGEND_FOOT: React.CSSProperties = {
  marginTop: 6, paddingTop: 8, borderTop: "1px solid var(--color-border)",
  fontSize: 10, color: "var(--color-text-subtle)", lineHeight: 1.4,
};

// Full-height side panel, mirroring the EV scatter panel layout.
// Narrower than the scatter (table data is compact); floor keeps it readable on
// smaller screens. Mobile bottom-sheet deferred to E-007.
const TABLE_PANEL: React.CSSProperties = {
  position: "absolute",
  top: 88,
  right: 0,
  bottom: 0,
  width: "clamp(280px, 24vw, 380px)",
  zIndex: 15,
  background: "var(--color-surface)",
  borderLeft: "1px solid var(--color-border)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "var(--shadow-md)",
  fontFamily: "var(--font-sans)",
  color: "var(--color-text)",
};

const TABLE_HEADER: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "4px 6px 4px 14px",
  background: "var(--color-navy)",
  color: "#fff",
  fontSize: 12,
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  flexShrink: 0,
};

const TABLE_STYLE: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 11,
};

const TH: React.CSSProperties = {
  padding: "6px 8px", textAlign: "left",
  background: "rgba(0,27,64,0.06)",
  borderBottom: "1px solid var(--color-border)",
  fontWeight: 600, fontSize: 10, color: "var(--color-text-subtle)",
  position: "sticky", top: 0,
  whiteSpace: "nowrap",
};

const TD: React.CSSProperties = {
  padding: "5px 8px",
  borderBottom: "1px solid rgba(0,0,0,0.04)",
  whiteSpace: "nowrap",
};

