/**
 * Explore view - the user-driven filter mode (Phase 3 functionality).
 * Manages filter state, debounce, aggregate -> renderer pipeline.
 *
 * Default metric is vehicles-per-household (the normalised choropleth); a toggle
 * switches to the quarter-normalised fleet estimate. Both values are derived from
 * the one aggregate pass and retained, so toggling never fires a new query.
 *
 * COLOUR SCALE (2026-06-10, Simon's call): both metrics render as a CLASSED
 * choropleth over FIXED cross-year breaks (engine/fixedStretch.ts) - 6 classes,
 * quantile-derived from the combined all-years distribution under the current
 * filter, rounded to nice values. Changing YEAR keeps the breaks (so change
 * shows as class jumps); changing FILTER or METRIC recomputes them (so EV-only
 * etc. still gets sensible breaks that are themselves year-comparable).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type Graphic from "@arcgis/core/Graphic";

import { FilterPanel } from "../components/FilterPanel";
import { Legend } from "../components/Legend";
import type { LegendMode } from "../components/Legend";

import { loadData, getYearData } from "../engine/loadData";
import { aggregate } from "../engine/aggregate";
import { buildClassedRenderer, classCounts } from "../engine/renderer";
import { computeFixedBreaks } from "../engine/fixedStretch";
import type { FixedClassBreaks } from "../engine/fixedStretch";
import { computePerHousehold } from "../engine/perHousehold";
import type { PerHouseholdEntry, PerHouseholdResult } from "../engine/perHousehold";
import { AggregateCache } from "../engine/cache";
import { getMakesByFrequency, getFuelsByFrequency } from "../engine/metadata";
import type { MakeOption, FuelOption } from "../engine/metadata";

import { DEFAULT_FILTER_STATE, FUEL_LABELS } from "../types";
import type { FilterState, AggregateResult } from "../types";
import type { DataStore } from "../engine/loadData";

import { useDebounce } from "../hooks/useDebounce";

interface Props {
  layer: FeatureLayer;
  allPostcodes: string[];
  householdsByPostcode: Map<string, number>;
  year: number;  // global year from App; changes reset fuel/make filters
  years: number[];
  onYearChange: (year: number) => void;
  currentTotals: React.MutableRefObject<AggregateResult>;
  onTotalsChange: (totals: AggregateResult) => void;
}

interface LegendState {
  mode: LegendMode;
  breaks: number[];
  counts: number[];
  yearSpan: [number, number];
  noDataCount: number;
  vicAvg: number | null;
}

const cache = new AggregateCache();

export function ExploreView({
  layer, allPostcodes, householdsByPostcode, year, years, onYearChange, currentTotals, onTotalsChange,
}: Props) {
  const dataStoreRef = useRef<DataStore | null>(null);
  // Retained results so the metric toggle re-renders without re-querying.
  const lastTotalsRef = useRef<AggregateResult | null>(null);
  const lastPerHHRef  = useRef<PerHouseholdResult | null>(null);
  // Fixed class breaks memoised per metric + filter signature (year-independent).
  const breaksCacheRef = useRef<Map<string, FixedClassBreaks>>(new Map());

  const [busy,        setBusy]        = useState(false);
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [makes,       setMakes]       = useState<MakeOption[]>([]);
  const [fuels,       setFuels]       = useState<FuelOption[]>([]);
  const [legend,      setLegend]      = useState<LegendState | null>(null);
  // Default to the normalised per-household metric; sticky across filter changes.
  const [metric,      setMetric]      = useState<LegendMode>("per_household");
  const metricRef = useRef(metric);
  metricRef.current = metric;

  const debouncedFilter = useDebounce(filterState, 250);

  // Fetches (or reuses) the fixed cross-year breaks for a metric + filter.
  // First call for a new filter may load not-yet-cached year files.
  const getBreaks = useCallback(
    async (mode: LegendMode, filter: FilterState): Promise<FixedClassBreaks> => {
      const key = `${mode}|${[...filter.fuels].sort().join(",")}|${[...filter.makes].sort().join(",")}`;
      const hit = breaksCacheRef.current.get(key);
      if (hit) return hit;
      const breaks = await computeFixedBreaks(
        dataStoreRef.current!, filter, mode, householdsByPostcode, allPostcodes, cache
      );
      breaksCacheRef.current.set(key, breaks);
      return breaks;
    },
    [householdsByPostcode, allPostcodes]
  );

  // Builds the renderer, popup and legend from retained values + the fixed
  // breaks. Pure read - no querying - so it serves filter changes and metric
  // toggles alike.
  const applyRendering = useCallback(
    (mode: LegendMode, perHH: PerHouseholdResult, fixed: FixedClassBreaks) => {
      const values = new Map<string, number | null>();
      if (mode === "per_household") {
        for (const pc of allPostcodes) {
          values.set(pc, perHH.byPostcode.get(pc)?.vehiclesPerHousehold ?? null);
        }
      } else {
        // Fleet estimate (records / quarters-in-year): zero -> grey "no data".
        for (const pc of allPostcodes) {
          const fleet = perHH.byPostcode.get(pc)?.fleet ?? 0;
          values.set(pc, fleet > 0 ? fleet : null);
        }
      }
      layer.renderer = buildClassedRenderer(values, allPostcodes, fixed);

      const withData = allPostcodes.filter((pc) => values.get(pc) != null).length;
      setLegend({
        mode,
        breaks: fixed.breaks,
        counts: classCounts(values, allPostcodes, fixed),
        yearSpan: fixed.years,
        noDataCount: allPostcodes.length - withData,
        vicAvg: perHH.vicAvg,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layer.popupTemplate = buildPopupTemplate(perHH.byPostcode, mode) as any;
    },
    [layer, allPostcodes]
  );

  // Initial data load + reset make/fuel on year change
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setBusy(true);
      try {
        const store = await loadData(year);
        if (cancelled) return;
        dataStoreRef.current = store;
        const yearData = await getYearData(store, year);
        setMakes(getMakesByFrequency(store.meta, yearData));
        setFuels(getFuelsByFrequency(store.meta, yearData));
        setFilterState((p) => ({ ...p, year }));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [year]);

  // Apply filter whenever debounced state changes
  useEffect(() => {
    const store = dataStoreRef.current;
    if (!store) return;

    let cancelled = false;
    async function run() {
      setBusy(true);
      try {
        const yearData = await getYearData(store!, debouncedFilter.year);
        if (cancelled) return;

        let totals = cache.get(debouncedFilter);
        if (!totals) {
          totals = aggregate(debouncedFilter, store!.meta, yearData);
          cache.set(debouncedFilter, totals);
        }

        const perHH = computePerHousehold(totals, householdsByPostcode, allPostcodes, debouncedFilter.year);
        const fixed = await getBreaks(metricRef.current, debouncedFilter);
        if (cancelled) return;

        currentTotals.current = totals;
        onTotalsChange(totals);
        lastTotalsRef.current = totals;
        lastPerHHRef.current  = perHH;

        applyRendering(metricRef.current, perHH, fixed);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilter]);

  // Metric toggle: re-render from retained values, no re-query (the breaks for
  // the other metric may still need a one-time computation).
  useEffect(() => {
    if (!lastPerHHRef.current) return;
    let cancelled = false;
    async function run() {
      const fixed = await getBreaks(metric, debouncedFilter);
      if (!cancelled && lastPerHHRef.current) applyRendering(metric, lastPerHHRef.current, fixed);
    }
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, applyRendering]);

  function filterLabel(): string {
    const parts: string[] = [];
    if (filterState.fuels.length > 0) parts.push(filterState.fuels.map((f) => FUEL_LABELS[f] ?? f).join(", "));
    if (filterState.makes.length > 0) parts.push(`${filterState.makes.length} make${filterState.makes.length > 1 ? "s" : ""}`);
    return parts.length === 0 ? `All vehicles · ${filterState.year}` : `${parts.join(" · ")} · ${filterState.year}`;
  }

  return (
    <>
      <FilterPanel
        filterState={filterState}
        makes={makes}
        fuels={fuels}
        busy={busy}
        year={year}
        years={years}
        metric={metric}
        onMetricChange={setMetric}
        onYearChange={onYearChange}
        onFuelsChange={(fuels) => setFilterState((p) => ({ ...p, fuels }))}
        onMakesChange={(makes) => setFilterState((p) => ({ ...p, makes }))}
        onClear={() => setFilterState((p) => ({ ...p, fuels: [], makes: [] }))}
      />
      {legend && (
        <Legend
          mode={legend.mode}
          breaks={legend.breaks}
          counts={legend.counts}
          yearSpan={legend.yearSpan}
          noDataCount={legend.noDataCount}
          vicAvg={legend.vicAvg}
          filterLabel={filterLabel()}
        />
      )}
    </>
  );
}

/** Postcode popup, formatted per active metric (see the per-household spec). */
function buildPopupTemplate(byPostcode: Map<string, PerHouseholdEntry>, mode: LegendMode) {
  return {
    title: "Postcode {POSTCODE}",
    content: (feature: { graphic: Graphic }) => {
      const pc = feature.graphic.attributes.POSTCODE as string;
      const e = byPostcode.get(pc);
      const records = (e?.aggregateTotal ?? 0).toLocaleString();
      const perHH = e?.vehiclesPerHousehold;
      const fleet = e ? Math.round(e.fleet).toLocaleString() : "0";
      const hh = e?.households;

      const wrap = (primary: string, secondary: string) =>
        `<div style="font-size:13px;padding:2px 0">
          <div><strong style="font-size:15px">${primary}</strong></div>
          <div style="color:var(--color-text-subtle);font-size:12px;margin-top:3px">${secondary}</div>
        </div>`;

      if (mode === "per_household") {
        if (perHH == null) {
          return wrap(`${records} registration records`, "↳ No household data for this postcode");
        }
        return wrap(
          `${perHH.toFixed(2)} vehicles per household`,
          `↳ ${fleet} vehicles (registrations est.) across ${hh!.toLocaleString()} households`
        );
      }
      // Fleet mode: the quarter-normalised estimate is the headline (it is what
      // the map colours), with the raw record count as context.
      return wrap(
        `${fleet} vehicles (fleet est.)`,
        perHH == null
          ? `↳ ${records} registration records · no household data`
          : `↳ ${records} registration records · ${perHH.toFixed(2)} per household`
      );
    },
  };
}
