import { FUEL_LABELS } from "../types";
import type { FilterState } from "../types";
import type { MakeOption, FuelOption } from "../engine/metadata";
import { YearSelect } from "./YearSelect";
import { MakeFilter } from "./MakeFilter";
import { MetricToggle } from "./MetricToggle";
import type { LegendMode } from "./Legend";

// Year leads the filter row so it sits with the other filters (fuel, make).
interface Props {
  filterState: FilterState;
  makes: MakeOption[];
  fuels: FuelOption[];
  busy: boolean;
  year: number;
  years: number[];
  metric: LegendMode;
  onMetricChange: (mode: LegendMode) => void;
  onYearChange: (year: number) => void;
  onFuelsChange: (fuels: string[]) => void;
  onMakesChange: (makes: string[]) => void;
  onClear: () => void;
}

/* ── concise fuel labels for the pill bar ───────────────────────────────── */
const FUEL_SHORT: Record<string, string> = {
  P: "Petrol", D: "Diesel", E: "Electric", G: "Gas",
  M: "Multi-fuel", H: "Hybrid", O: "Other",
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    height: 28,
    padding: "0 11px",
    // Ripple uses rectangular chips (radius-sm), not rounded bubbles.
    borderRadius: "var(--radius-sm)",
    border: active
      ? "1.5px solid #fff"
      : "1px solid rgba(255,255,255,0.30)",
    // Active = solid white with navy text - clear, decisive, not frosted glass.
    background: active ? "#fff" : "transparent",
    color: active ? "var(--color-navy)" : "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontFamily: "var(--font-sans)",
    fontWeight: active ? 700 : 400,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "all var(--transition-fast)",
    letterSpacing: "0.01em",
    outline: "none",
  };
}

export function FilterPanel({
  filterState,
  makes,
  fuels,
  busy,
  year,
  years,
  metric,
  onMetricChange,
  onYearChange,
  onFuelsChange,
  onMakesChange,
  onClear,
}: Props) {
  // Merge M (Multi-fuel) and O (Other) into a single "Other" chip. H (Hybrid)
  // has zero records in the current dataset and is suppressed if it appears.
  // The original fuels list is frequency-sorted by getFuelsByFrequency; the
  // merged "Other" chip is appended at the end.
  const displayFuels: FuelOption[] = (() => {
    const named: FuelOption[] = [];
    let otherTotal = 0;
    let hasOther = false;
    for (const f of fuels) {
      if (f.code === "H") continue;
      if (f.code === "M" || f.code === "O") { otherTotal += f.total; hasOther = true; }
      else named.push(f);
    }
    if (hasOther) named.push({ code: "O", label: "Other", total: otherTotal });
    return named;
  })();

  // Single-select: clicking an inactive chip selects only that fuel (or M+O for
  // the "Other" chip). Clicking the active chip deselects back to "all fuels".
  function toggleFuel(code: string) {
    const codes = code === "O" ? ["M", "O"] : [code];
    const isActive = code === "O"
      ? (filterState.fuels.includes("O") || filterState.fuels.includes("M"))
      : filterState.fuels.includes(code);
    onFuelsChange(isActive ? [] : codes);
  }

  function isFuelActive(code: string): boolean {
    return code === "O"
      ? (filterState.fuels.includes("O") || filterState.fuels.includes("M"))
      : filterState.fuels.includes(code);
  }

  const hasActive = filterState.fuels.length > 0 || filterState.makes.length > 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 40, left: 0, right: 0,    /* sits below the Row 1 brand/switcher bar */
        zIndex: 20,
        height: 48,
        background: "var(--color-navy)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      <style>{`
        @keyframes busyPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        /* Divider */
        .rpl-div {
          width:1px; height:24px;
          background:rgba(255,255,255,0.18); flex-shrink:0;
        }

        /* Section label */
        .rpl-lbl {
          color:rgba(255,255,255,0.6); font-size:10px;
          text-transform:uppercase; letter-spacing:0.07em;
          white-space:nowrap; flex-shrink:0;
        }

        /* Hover only on inactive pills; active pills keep their solid white bg */
        .rpl-pill:not([data-active]):hover { background:rgba(255,255,255,0.12) !important; color:#fff !important; }
        .rpl-pill:focus { box-shadow:0 0 0 3px var(--color-focus); outline:none; }

        /* Clear button */
        .rpl-clear {
          margin-left:auto; height:28px; padding:0 12px;
          border:1px solid rgba(255,255,255,0.28);
          border-radius:var(--radius-sm);
          background:transparent; color:rgba(255,255,255,0.75);
          font-size:12px; font-family:var(--font-sans);
          cursor:pointer; white-space:nowrap; flex-shrink:0;
          transition:all var(--transition-fast);
        }
        .rpl-clear:not(:disabled):hover {
          background:rgba(255,255,255,0.10); color:#fff;
        }
        .rpl-clear:focus { box-shadow:0 0 0 3px var(--color-focus); outline:none; }
        .rpl-clear:disabled { opacity:0.35; cursor:default; }

        /* Busy progress bar */
        .rpl-busy {
          position:absolute; bottom:0; left:0; right:0; height:2px;
          background:var(--color-focus);
          animation:busyPulse 1.1s ease-in-out infinite;
        }
      `}</style>

      <YearSelect years={years} value={year} onChange={onYearChange} />

      <div className="rpl-div" />

      {/* ── Metric: per-household (default) vs total ── */}
      <span className="rpl-lbl">Show</span>
      <MetricToggle value={metric} onChange={onMetricChange} />

      <div className="rpl-div" />

      {/* ── Fuel pills (single-select; M+O merged into one "Other" chip) ── */}
      <span className="rpl-lbl">Fuel</span>
      <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "nowrap" }}>
        {displayFuels.map(({ code }) => {
          const active = isFuelActive(code);
          return (
            <button
              key={code}
              className="rpl-pill"
              data-active={active ? "" : undefined}
              style={pillStyle(active)}
              onClick={() => toggleFuel(code)}
              title={code === "O" ? "Multi-fuel and Other" : (FUEL_LABELS[code] ?? code)}
            >
              {FUEL_SHORT[code] ?? code}
            </button>
          );
        })}
      </div>

      <div className="rpl-div" />

      {/* ── Make (Ripple-styled multi-select; ranked by volume, shows shares) ── */}
      <span className="rpl-lbl">Make</span>
      <MakeFilter makes={makes} selected={filterState.makes} onChange={onMakesChange} />

      {/* ── Clear ── */}
      <button
        className="rpl-clear"
        onClick={onClear}
        disabled={!hasActive}
      >
        Clear filters
      </button>

      {busy && <div className="rpl-busy" />}
    </div>
  );
}
