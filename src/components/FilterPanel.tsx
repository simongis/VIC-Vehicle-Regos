import { FUEL_LABELS } from "../types";
import type { FilterState } from "../types";
import type { MakeOption, FuelOption } from "../engine/metadata";
import { YearSelect } from "./YearSelect";
import { MakeFilter } from "./MakeFilter";
import { SegmentedControl } from "./SegmentedControl";
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

/* ── concise fuel labels for the chip row ───────────────────────────────── */
const FUEL_SHORT: Record<string, string> = {
  P: "Petrol", D: "Diesel", E: "Electric", G: "Gas",
  M: "Multi-fuel", H: "Hybrid", O: "Other",
};

const METRIC_OPTIONS = [
  { value: "per_household", label: "Per household" },
  { value: "total",         label: "Total vehicles" },
] as const;

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
    <div className="control-strip">
      <YearSelect years={years} value={year} onChange={onYearChange} />

      <div className="strip-divider" />

      {/* ── Metric: per-household (default) vs total ── */}
      <span className="strip-label">Show</span>
      <SegmentedControl
        value={metric}
        options={METRIC_OPTIONS}
        onChange={onMetricChange}
        ariaLabel="Choropleth metric"
      />

      <div className="strip-divider" />

      {/* ── Fuel chips (single-select; M+O merged into one "Other" chip) ── */}
      <span className="strip-label">Fuel</span>
      <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "nowrap" }}>
        {displayFuels.map(({ code }) => {
          const active = isFuelActive(code);
          return (
            <button
              key={code}
              className="chip"
              data-active={active ? "" : undefined}
              onClick={() => toggleFuel(code)}
              aria-pressed={active}
              title={code === "O" ? "Multi-fuel and Other" : (FUEL_LABELS[code] ?? code)}
            >
              {FUEL_SHORT[code] ?? code}
            </button>
          );
        })}
      </div>

      <div className="strip-divider" />

      {/* ── Make (single-select picker; ranked by volume, shows shares) ── */}
      <span className="strip-label">Make</span>
      <MakeFilter makes={makes} selected={filterState.makes} onChange={onMakesChange} />

      {/* ── Clear ── */}
      <button
        className="btn-ghost"
        style={{ marginLeft: "auto" }}
        onClick={onClear}
        disabled={!hasActive}
      >
        Clear filters
      </button>

      {busy && <div className="busy-bar" />}
    </div>
  );
}
