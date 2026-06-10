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
import { ControlStrip } from "../components/ControlStrip";
import { MapCard, MapCardRow } from "../components/MapCard";

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
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateNew, setStateNew] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number>(2020);
  const [profiles, setProfiles] = useState<Map<string, AgeProfile>>(new Map());
  const [showTable, setShowTable] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
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
        setHasLoaded(true);
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
      <ControlStrip
        years={years}
        year={year}
        onYearChange={onYearChange}
        title="New vs Old"
        note={headline || "Share of each postcode's fleet made in the last five years"}
        error={error}
        busy={!ready && !error}
      />

      {/* Legend - bottom left, fixed 6 classes */}
      {hasLoaded && (
        <MapCard
          title={`% made ${threshold} or later`}
          collapsible
          footer={
            <>
              "Last 5 years" = made {threshold} or later. Fixed breaks.
              Unknown manufacture year excluded from denominator.
            </>
          }
        >
          {CLASS_LABELS.map((label, i) => (
            <MapCardRow key={label} color={`rgb(${RDYLGN_6[i].join(",")})`} label={label} />
          ))}
          <MapCardRow color="#d9d9d9" label="No data" subtle />
        </MapCard>
      )}

      {/* Table panel - collapsed: tab on right edge; expanded: full-height side panel */}
      {hasLoaded && !showTable && (
        <button className="edge-tab" onClick={() => setShowTable(true)} title="Show table">
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>‹</span> Table
        </button>
      )}

      {hasLoaded && showTable && (
        <div className="side-panel" style={{ width: "clamp(280px, 24vw, 380px)" }}>
          {/* Panel header: title + extent toggle + collapse */}
          <div className="side-panel__header">
            <h2 className="side-panel__title">
              {scopeLabel} by % new
            </h2>
            {/* Extent-only toggle - same viewfinder icon as EV scatter */}
            <button
              className="icon-btn"
              onClick={() => setExtentOnly((v) => !v)}
              title={extentOnly ? "Showing postcodes in view - click to show all" : "Showing all postcodes - click to sync to map"}
              aria-label="Sync table to map extent"
              aria-pressed={extentOnly}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3" />
                <circle cx="8" cy="8" r="2.2" />
              </svg>
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowTable(false)}
              title="Hide table"
              aria-label="Hide table"
              style={{ fontSize: 15 }}
            >
              ›
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Postcode</th>
                  <th scope="col" data-num>% New</th>
                  <th scope="col" data-num>New</th>
                  <th scope="col" data-num>Total</th>
                  <th scope="col" data-num>Veh/HH</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const ci = classIndex(row.pctNew);
                  const [r, g, b] = RDYLGN_6[ci];
                  return (
                    <tr
                      key={row.pc}
                      onClick={() => handleRowClick(row.pc)}
                      data-selected={row.pc === selectedPostcode ? "" : undefined}
                    >
                      <td>{row.pc}</td>
                      {/* % New cell: left-border swatch coloured to match the map legend class */}
                      <td data-num style={{
                        fontWeight: 600,
                        boxShadow: `inset 3px 0 0 rgb(${r},${g},${b})`,
                        paddingLeft: 10,
                      }}>
                        {row.pctNew.toFixed(1)}%
                      </td>
                      <td data-num>{row.newRecs.toLocaleString()}</td>
                      <td data-num>{row.totalRecs.toLocaleString()}</td>
                      <td data-num style={{ color: "var(--color-text-subtle)" }}>
                        {row.vehPerHH ?? "N/A"}
                      </td>
                    </tr>
                  );
                })}
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--color-text-subtle)", padding: "12px 0" }}>
                      No postcodes in current view
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="side-panel__foot">
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
        return `<div style="font-size:13px">No manufacture-year data for this postcode.</div>`;
      }
      const row = (label: string, v: number) =>
        `<tr><td style="padding:1px 8px 1px 0;color:var(--color-text-subtle)">${label}</td><td style="text-align:right">${v.toLocaleString()}</td></tr>`;
      return `<div style="font-size:13px;padding:2px 0">
        <div><strong style="font-size:15px">${p.pctNew.toFixed(1)}%</strong> made ${recentLabel}</div>
        <div style="color:var(--color-text-subtle);margin:3px 0 6px">${p.newRecs.toLocaleString()} of ${p.knownRecs.toLocaleString()} known-age records</div>
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


