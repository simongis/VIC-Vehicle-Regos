import { useState } from "react";

export type LegendMode = "per_household" | "total";

interface Props {
  mode: LegendMode;
  p2: number;
  p98: number;
  noDataCount: number;
  filterLabel: string;
  /** Population-weighted Victorian average vehicles/household (per-household mode only). */
  vicAvg?: number | null;
}

const RAMP_GRADIENT = "linear-gradient(to right, #dde8f7, #003174)";

export function Legend({ mode, p2, p98, noDataCount, filterLabel, vicAvg }: Props) {
  const [minimised, setMinimised] = useState(false);

  const perHH = mode === "per_household";
  const title = perHH ? "Vehicles per household" : "Total vehicles";
  const fmt = (v: number) => (perHH ? v.toFixed(1) : Math.round(v).toLocaleString());

  // Position of the Vic-avg marker along the p2-p98 ramp (clamped into view).
  const avgPos =
    perHH && vicAvg != null && p98 > p2
      ? Math.max(0, Math.min(1, (vicAvg - p2) / (p98 - p2)))
      : null;

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

      {/* Gradient ramp (with the Vic-avg marker for per-household mode) */}
      <div style={{ position: "relative", marginBottom: 4 }}>
        <div style={{ height: 10, borderRadius: "var(--radius-sm)", background: RAMP_GRADIENT }} />
        {avgPos != null && (
          <div
            title={`Victorian average: ${vicAvg!.toFixed(1)}`}
            style={{
              position: "absolute", top: -2, bottom: -2, left: `${avgPos * 100}%`,
              width: 2, background: "var(--color-text)", transform: "translateX(-1px)",
            }}
          />
        )}
      </div>

      {/* Range labels */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-subtle)", marginBottom: 2 }}>
        <span>{fmt(p2)}</span>
        <span>{fmt(p98)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-subtle)", marginBottom: 8 }}>
        <span>Low</span>
        <span>High</span>
      </div>

      {/* Vic avg annotation (per-household mode only) */}
      {perHH && vicAvg != null && (
        <div style={{ fontSize: 11, color: "var(--color-text)", marginBottom: 8 }}>
          Vic avg: <strong>{vicAvg.toFixed(1)}</strong> vehicles/household
        </div>
      )}

      {/* No-data swatch */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div style={{ width: 14, height: 10, borderRadius: 2, flexShrink: 0, background: "#d9d9d9", border: "1px solid var(--color-border)" }} />
        <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
          No data ({noDataCount} postcode{noDataCount !== 1 ? "s" : ""})
        </span>
      </div>

      {/* Footer note */}
      <div style={{ paddingTop: 8, borderTop: "1px solid var(--color-border)", fontSize: 10, color: "var(--color-text-subtle)", lineHeight: 1.4 }}>
        Colour clamped to 2nd-98th percentile.<br />
        {perHH
          ? "Registered vehicles (quarterly average) per ABS household."
          : "Summed registration records across the year's quarters."}
      </div>
    </div>
  );
}
