/**
 * "Fleet Trends" - the temporal (non-spatial) preset. State-wide quarterly fuel
 * totals from timeline.json, charted with ECharts. Unlike the other views this
 * one isn't a choropleth, so it covers the map with a chart surface and hides
 * the shared layer while active.
 */
import { useEffect, useMemo, useState } from "react";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";

import { loadTimeline } from "../engine/loadTimeline";
import { TimelineChart } from "../components/TimelineChart";
import type { TimelineMode } from "../components/TimelineChart";
import type { TimelineEntry } from "../types";
import { YearSelect } from "../components/YearSelect";

interface Props {
  sharedLayer: FeatureLayer;
  year: number;
  years: number[];
  onYearChange: (year: number) => void;
}

export function TimelineView({ sharedLayer, year, years, onYearChange }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [mode, setMode] = useState<TimelineMode>("ev");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    sharedLayer.visible = false; // chart-centric view - the map isn't relevant here
    loadTimeline()
      .then((t) => { if (!cancelled) setEntries(t); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; sharedLayer.visible = true; };
  }, [sharedLayer]);

  // Headline EV-growth multiple (latest EV count / earliest EV count).
  const evGrowth = useMemo(() => {
    const ev = entries.filter((e) => e.fuel === "E").sort((a, b) =>
      `${a.year}-${a.quarter}`.localeCompare(`${b.year}-${b.quarter}`));
    if (ev.length < 2 || ev[0].total === 0) return null;
    return {
      first: ev[0], last: ev[ev.length - 1],
      multiple: ev[ev.length - 1].total / ev[0].total,
    };
  }, [entries]);

  const tab = (m: TimelineMode, label: string) => (
    <button
      onClick={() => setMode(m)}
      style={{
        height: 26, padding: "0 12px",
        border: "1px solid rgba(255,255,255,0.3)", borderRadius: "var(--radius-sm)",
        background: mode === m ? "rgba(255,255,255,0.16)" : "transparent",
        color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-sans)",
        fontWeight: mode === m ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

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
        <span style={{ color: "#fff", fontWeight: 600 }}>Registration trends: quarterly</span>
        <div style={{ display: "flex", gap: 6 }}>
          {tab("ev", "Electric uptake")}
          {tab("mix", "Fuel mix")}
        </div>
        {error && <span style={{ color: "#ffb4b4", fontSize: 11 }}>{error}</span>}
      </div>

      {/* Chart surface - covers the map area below the two top rows */}
      <div style={{
        position: "absolute", top: 88, left: 0, right: 0, bottom: 0, zIndex: 15,
        background: "var(--color-surface)", display: "flex", flexDirection: "column",
        fontFamily: "var(--font-sans)",
      }}>
        <div style={{
          padding: "14px 20px 4px", display: "flex", alignItems: "baseline", gap: 16,
          flexWrap: "wrap",
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text, #1a1a1a)" }}>
            {mode === "ev" ? "Electric vehicle uptake" : "Fuel composition"}
          </h2>
          {mode === "ev" && evGrowth && (
            <span style={{ fontSize: 13, color: "var(--color-text-subtle, #555)" }}>
              EV registrations <strong style={{ color: "#00a37a" }}>
                {evGrowth.multiple.toFixed(1)}×
              </strong> from {evGrowth.first.year} Q{evGrowth.first.quarter} to {evGrowth.last.year} Q{evGrowth.last.quarter}
              &nbsp;({evGrowth.first.total.toLocaleString()} → {evGrowth.last.total.toLocaleString()})
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-subtle, #888)" }}>
            State-wide registration snapshots · {year} highlighted
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: "0 12px 12px" }}>
          <TimelineChart entries={entries} mode={mode} highlightYear={year} />
        </div>
      </div>
    </>
  );
}
