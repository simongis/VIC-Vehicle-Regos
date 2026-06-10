import type { LegendMode } from "./Legend";

interface Props {
  value: LegendMode;
  onChange: (mode: LegendMode) => void;
}

const OPTIONS: { value: LegendMode; label: string }[] = [
  { value: "per_household", label: "Per household" },
  { value: "total", label: "Total vehicles" },
];

/**
 * Segmented pill control for the Explore choropleth metric. Ripple-styled to
 * match the filter bar (the spec called for calcite-segmented-control, but
 * Calcite was removed from the app chrome - it rendered at height 0 - so this is
 * a hand-rolled segmented control on the same tokens as the fuel pills).
 */
export function MetricToggle({ value, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Choropleth metric"
      style={{
        display: "flex", flexShrink: 0, height: 28, padding: 2, gap: 1,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.30)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {OPTIONS.map(({ value: v, label }) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(v)}
            style={{
              height: 24, padding: "0 12px", border: "none",
              borderRadius: "var(--radius-sm)",
              background: active ? "#fff" : "transparent",
              color: active ? "var(--color-navy)" : "rgba(255,255,255,0.66)",
              fontSize: 12, fontWeight: active ? 600 : 400,
              fontFamily: "var(--font-sans)", cursor: "pointer",
              whiteSpace: "nowrap", transition: "all var(--transition-fast)",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
