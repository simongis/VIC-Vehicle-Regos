import { useCallback, useEffect, useRef, useState } from "react";
import type ArcGISMapView from "@arcgis/core/views/MapView";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type Graphic from "@arcgis/core/Graphic";

import { MapView } from "./components/MapView";
import { ViewSwitcher } from "./components/ViewSwitcher";
import type { ViewId } from "./components/ViewSwitcher";
import { ExploreView } from "./views/ExploreView";
import { EVSESView } from "./views/EVSESView";
import { DominantMakeView } from "./views/DominantMakeView";
import { NewVsOldView } from "./views/NewVsOldView";
import { TimelineView } from "./views/TimelineView";

import { loadGeometry } from "./engine/loadGeometry";
import { loadData } from "./engine/loadData";
import type { DataStore } from "./engine/loadData";

import type { AggregateResult } from "./types";

// ---------------------------------------------------------------------------
// Two-row top bar heights
const ROW1_H = 40;   // brand + view switcher
const ROW2_H = 48;   // context controls (filter or preset strip)
export const TOPBAR_H = ROW1_H + ROW2_H;

// ---------------------------------------------------------------------------

export function App() {
  const layerRef          = useRef<FeatureLayer | null>(null);
  const viewRef           = useRef<ArcGISMapView | null>(null);
  const allPostcodesRef   = useRef<string[]>([]);
  const graphicsByPostcodeRef = useRef<Map<string, Graphic>>(new Map());
  const seifaRef          = useRef<Map<string, number>>(new Map());
  const householdsRef     = useRef<Map<string, number>>(new Map());
  const dataStoreRef      = useRef<DataStore | null>(null);
  const currentTotals     = useRef<AggregateResult>(new Map());

  const [engineReady, setEngineReady] = useState(false);
  const [activeView,  setActiveView]  = useState<ViewId>("explore");
  const [year,        setYear]        = useState(2025);
  const [availableYears, setAvailableYears] = useState<number[]>([2023, 2024, 2025, 2026]);

  // ---------------------------------------------------------------------------
  const handleViewReady = useCallback(async (view: ArcGISMapView) => {
    viewRef.current = view;
    const [geoStore, dataStore] = await Promise.all([
      loadGeometry(),
      loadData(2025),
    ]);

    layerRef.current        = geoStore.layer;
    allPostcodesRef.current = Array.from(geoStore.graphicsByPostcode.keys());
    graphicsByPostcodeRef.current = geoStore.graphicsByPostcode;
    seifaRef.current        = geoStore.seifaByPostcode;
    householdsRef.current   = geoStore.householdsByPostcode;
    dataStoreRef.current    = dataStore;

    // Available years from the loaded metadata (sorted descending)
    const years = [...dataStore.meta.years].sort((a, b) => b - a);
    setAvailableYears(years);

    view.map?.add(geoStore.layer);
    view.map?.add(geoStore.boundaryLayer); // state outline sits above the choropleth
    setEngineReady(true);
  }, []);

  // Sync active view with URL hash for development isolation
  useEffect(() => {
    const hash = window.location.hash.replace("#/", "") as ViewId;
    if (["ev-ses", "dominant-make", "new-vs-old", "timeline"].includes(hash)) setActiveView(hash);
  }, []);

  const handleViewChange = (id: ViewId) => {
    setActiveView(id);
    window.location.hash = `/${id}`;
  };

  // ---------------------------------------------------------------------------
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapView
        onReady={handleViewReady}
        topOffset={TOPBAR_H}
      />

      {/* ── Row 1: Victorian-Government-style masthead + primary nav ── */}
      <header
        className="masthead"
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: ROW1_H,
          zIndex: "var(--z-masthead)" as unknown as number,
          background: "var(--color-header)",
          display: "flex",
          alignItems: "stretch",
          padding: "0 16px 0 0",
          fontFamily: "var(--font-sans)",
          // Gold keyline along the bottom of the masthead - a recognisable
          // Victorian-Government device, and a crisp separation from the strip.
          borderBottom: "2px solid var(--color-gold)",
        }}
      >
        {/* Brand lockup: gold tab + title, reads as an official product masthead */}
        <div className="masthead-brand" style={{ display: "flex", alignItems: "center", flexShrink: 0, paddingLeft: 16 }}>
          <span aria-hidden style={{
            width: 4, height: 22, background: "var(--color-gold)", borderRadius: 1, marginRight: 12,
          }} />
          <h1 style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, whiteSpace: "nowrap", margin: 0 }}>
            <span style={{
              color: "var(--on-dark-subtle)", fontSize: 9, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.13em",
            }}>
              Victoria
            </span>
            <span style={{ color: "var(--on-dark-strong)", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>
              Vehicle Registrations
            </span>
          </h1>
        </div>

        <div className="masthead-divider" style={{ width: 1, margin: "10px 18px", background: "var(--on-dark-divider)", flexShrink: 0 }} />

        <ViewSwitcher current={activeView} onChange={handleViewChange} />
        {/* Year lives in each view's Row 2 strip, alongside that view's controls. */}

        {/* Data provenance: subtle, right-aligned, linked to the source dataset.
            Source is the Victorian Department of Transport and Planning (DTP)
            "Whole fleet vehicle registration snapshot by postcode". */}
        <a
          className="masthead-provenance"
          href="https://discover.data.vic.gov.au/dataset/whole-fleet-vehicle-registration-snapshot-by-postcode"
          target="_blank"
          rel="noopener noreferrer"
          title="Data source: Victorian Department of Transport and Planning - Vehicle registration snapshot by postcode (opens in a new tab)"
          style={{
            marginLeft: "auto", alignSelf: "center", flexShrink: 0, paddingLeft: 16,
            color: "var(--on-dark-subtle)", fontSize: 10.5, lineHeight: 1.2,
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          Data: Victorian DTP <span aria-hidden>&#8599;</span>
        </a>
        <a
          className="masthead-provenance"
          href="https://github.com/simongis/VIC-Vehicle-Regos"
          target="_blank"
          rel="noopener noreferrer"
          title="View source on GitHub"
          style={{
            alignSelf: "center", flexShrink: 0, marginLeft: 12,
            color: "rgba(255,255,255,0.5)", lineHeight: 0,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15
              -.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87
              .51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12
              0 0 .67-.21 2.2.82a7.64 7.64 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16
              1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54
              1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
      </header>

      {/* ── Row 2: Context controls - rendered by the active view ── */}
      {/* (Each view renders its own 48px strip absolutely positioned at top: ROW1_H) */}

      {/* ── Active view ── */}
      {engineReady && layerRef.current && (
        <>
          {activeView === "explore" && (
            <ExploreView
              layer={layerRef.current}
              allPostcodes={allPostcodesRef.current}
              householdsByPostcode={householdsRef.current}
              year={year}
              years={availableYears}
              onYearChange={setYear}
              currentTotals={currentTotals}
              onTotalsChange={() => { /* future: sync popup */ }}
            />
          )}

          {activeView === "ev-ses" && dataStoreRef.current && viewRef.current && (
            <EVSESView
              view={viewRef.current}
              layer={layerRef.current}
              graphicsByPostcode={graphicsByPostcodeRef.current}
              allPostcodes={allPostcodesRef.current}
              seifaByPostcode={seifaRef.current}
              dataStore={dataStoreRef.current}
              year={year}
              years={availableYears}
              onYearChange={setYear}
            />
          )}

          {activeView === "dominant-make" && dataStoreRef.current && viewRef.current && (
            <DominantMakeView
              layer={layerRef.current}
              view={viewRef.current}
              dataStore={dataStoreRef.current}
              year={year}
              years={availableYears}
              onYearChange={setYear}
              graphicsByPostcode={graphicsByPostcodeRef.current}
            />
          )}

          {activeView === "new-vs-old" && dataStoreRef.current && viewRef.current && (
            <NewVsOldView
              layer={layerRef.current}
              dataStore={dataStoreRef.current}
              year={year}
              years={availableYears}
              onYearChange={setYear}
              view={viewRef.current}
              householdsByPostcode={householdsRef.current}
              graphicsByPostcode={graphicsByPostcodeRef.current}
            />
          )}

          {activeView === "timeline" && (
            <TimelineView
              sharedLayer={layerRef.current}
              year={year}
              years={availableYears}
              onYearChange={setYear}
            />
          )}
        </>
      )}
    </div>
  );
}
