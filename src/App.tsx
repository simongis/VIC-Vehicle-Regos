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
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: ROW1_H,
          zIndex: 30,
          background: "var(--color-header)",
          display: "flex",
          alignItems: "stretch",
          padding: "0 16px 0 0",
          fontFamily: "var(--font-sans)",
          // Gold keyline along the bottom of the masthead - a recognisable
          // Victorian-Government device, and a crisp separation from the toolbar.
          borderBottom: "2px solid var(--color-gold)",
        }}
      >
        {/* Brand lockup: gold tab + title, reads as an official product masthead */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, paddingLeft: 16 }}>
          <span aria-hidden style={{
            width: 4, height: 22, background: "var(--color-gold)", borderRadius: 1, marginRight: 12,
          }} />
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, whiteSpace: "nowrap" }}>
            <span style={{
              color: "rgba(255,255,255,0.62)", fontSize: 9, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.13em",
            }}>
              Victoria
            </span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>
              Vehicle Registrations
            </span>
          </span>
        </div>

        <div style={{ width: 1, margin: "10px 18px", background: "rgba(255,255,255,0.16)", flexShrink: 0 }} />

        <ViewSwitcher current={activeView} onChange={handleViewChange} />
        {/* Year lives in each view's Row 2 strip, alongside that view's controls. */}

        {/* Data provenance: subtle, right-aligned, linked to the source dataset.
            Source is the Victorian Department of Transport and Planning (DTP)
            "Whole fleet vehicle registration snapshot by postcode". */}
        <a
          href="https://discover.data.vic.gov.au/dataset/whole-fleet-vehicle-registration-snapshot-by-postcode"
          target="_blank"
          rel="noopener noreferrer"
          title="Data source: Victorian Department of Transport and Planning - Vehicle registration snapshot by postcode (opens in a new tab)"
          style={{
            marginLeft: "auto", alignSelf: "center", flexShrink: 0, paddingLeft: 16,
            color: "rgba(255,255,255,0.66)", fontSize: 10.5, lineHeight: 1.2,
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          Data: Victorian DTP <span aria-hidden>&#8599;</span>
        </a>
      </div>

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
