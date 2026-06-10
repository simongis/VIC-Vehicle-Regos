import { useState } from "react";
import { CLASS_COLORS } from "../engine/renderer";
import { classIndexFor } from "../engine/fixedStretch";

export type LegendMode = "per_household" | "total";

interface Props {
  mode: LegendMode;
  /** 5 ascending interior break values (6 classes), fixed across years. */
  breaks: number[];
  /** Per-class postcode counts for the CURRENT year. */
  counts: number[];
  /** First and last year the fixed breaks cover. */
  yearSpan: [number, number];
  noDataCount: number;
  filterLabel: string;
  /** Population-weighted Victorian average vehicles/household (per-household mode only). */
  vicAvg?: number | null;
}

export function Legend({ mode, breaks, counts, yearSpan, noDataCount, filterLabel, vicAvg }: Props) {
  const [minimised, setMinimised] = useState(false);

  const perHH = mode === "per_household";
  const title = perHH ? "Vehicles per household" : "Total vehicles (fleet est.)";
  const fmt = (v: number) => (perHH ? trimZeros(v) : Math.round(v).toLocaleString());

  // Class row labels: "< b1", "b1 – b2", ..., "b5 +" (en dash in numeric ranges).
  const labels = CLASS_COLORS.map((_, i) => {
    if (i === 0) return `< ${fmt(breaks[0])}`;
    if (i === CLASS_COLORS.length - 1) return `${fmt(breaks[breaks.length - 1])} +`;
    return `${fmt(breaks[i - 1])} – ${fmt(breaks[i])}`;
  });

  const avgClass = perHH && vicAvg != null ? classIndexFor(breaks, vicAvg) : null;

  if (minimised) {
    return (
      <button
        onClick={() => setMinimised(false)}
        style={{
          position: "absolute", bottom: 32, left: 12, zIndex: 10,
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)", padding: "6px 12px", fontSize: 11,
          fontFamily: "var(--font-sans)", color: "var(--color-text-subtle)",
          cursor: "pointer", boxShadow: "var(--shadow-sm)",
        }}
      >
        Legend ▲
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute", bottom: 32, left: 12, zIndex: 10,
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)", padding: "12px 14px", minWidth: 210,
        boxShadow: "var(--shadow-md)", fontFamily: "var(--font-sans)",
        fontSize: 12, color: "var(--color-text)",
      }}
    >
      {/* Header: metric title + minimise */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>{title}</span>
        <button
          onClick={() => setMinimised(true)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--color-text-subtle)", fontSize: 11, padding: "0 0 0 8px", lineHeight: 1,
          }}
        >
          ▼
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-subtle)", marginBottom: 8 }}>{filterLabel}</div>

      {/* Class rows: swatch + range + this-year postcode count */}
      {CLASS_COLORS.map((color, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{
            width: 14, height: 11, borderRadius: 2, flexShrink: 0,
            background: color, border: "1px solid rgba(0,0,0,0.12)",
          }} />
          <span style={{ flex: 1, fontSize: 11 }}>
            {labels[i]}
            {avgClass === i && (
              <span style={{ color: "var(--color-text-subtle)", marginLeft: 6 }} title={`Victorian average: ${vicAvg!.toFixed(1)}`}>
                ◂ Vic avg {vicAvg!.toFixed(1)}
              </span>
            )}
          </span>
          <span style={{ color: "var(--color-text-subtle)", fontSize: 10 }}>{counts[i]}</span>
        </div>
      ))}

      {/* No-data swatch */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, marginBottom: 6 }}>
        <span style={{ width: 14, height: 11, borderRadius: 2, flexShrink: 0, background: "#d9d9d9", border: "1px solid var(--color-border)" }} />
        <span style={{ flex: 1, fontSize: 11, color: "var(--color-text-subtle)" }}>No data</span>
        <span style={{ color: "var(--color-text-subtle)", fontSize: 10 }}>{noDataCount}</span>
      </div>

      {/* Footer note */}
      <div style={{ paddingTop: 8, borderTop: "1px solid var(--color-border)", fontSize: 10, color: "var(--color-text-subtle)", lineHeight: 1.4 }}>
        Class breaks held constant {yearSpan[0]}–{yearSpan[1]}, so years compare directly.<br />
        {perHH
          ? "Registered vehicles (quarterly average) per ABS household."
          : "Estimated standing fleet = registration records ÷ quarters in the year."}
      </div>
    </div>
  );
}

/** 1.5 -> "1.5", 2 -> "2" (cleaner break labels than a forced decimal). */
function trimZeros(v: number): string {
  return Number(v.toFixed(2)).toString();
}
