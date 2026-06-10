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
import { ControlStrip } from "../components/ControlStrip";
import { SegmentedControl } from "../components/SegmentedControl";

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

  return (
    <>
      {/* Context strip - Row 2 position */}
      <ControlStrip
        years={years}
        year={year}
        onYearChange={onYearChange}
        title="Registration Trends"
        error={error}
      >
        <SegmentedControl
          value={mode}
          options={[
            { value: "ev",  label: "Electric uptake" },
            { value: "mix", label: "Fuel mix" },
          ] as const}
          onChange={setMode}
          ariaLabel="Chart mode"
        />
      </ControlStrip>

      {/* Chart surface - covers the map area below the two top rows */}
      <div style={{
        position: "absolute", top: "var(--topbar-h)", left: 0, right: 0, bottom: 0,
        zIndex: "var(--z-panel)" as unknown as number,
        background: "var(--color-surface)", display: "flex", flexDirection: "column",
        fontFamily: "var(--font-sans)",
      }}>
        <div style={{
          padding: "14px 20px 4px", display: "flex", alignItems: "baseline", gap: 16,
          flexWrap: "wrap",
        }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--color-text)" }}>
            {mode === "ev" ? "Electric vehicle uptake" : "Fuel composition"}
          </h3>
          {mode === "ev" && evGrowth && (
            <span style={{ fontSize: "var(--text-md)", color: "var(--color-text-subtle)" }}>
              EV registrations <strong style={{ color: "#00a37a" }}>
                {evGrowth.multiple.toFixed(1)}×
              </strong> from {evGrowth.first.year} Q{evGrowth.first.quarter} to {evGrowth.last.year} Q{evGrowth.last.quarter}
              &nbsp;({evGrowth.first.total.toLocaleString()} → {evGrowth.last.total.toLocaleString()})
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--color-text-subtle)" }}>
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
