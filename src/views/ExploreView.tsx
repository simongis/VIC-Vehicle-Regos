/**
 * Explore view - the user-driven filter mode (Phase 3 functionality).
 * Manages filter state, debounce, aggregate -> renderer pipeline.
 *
 * Default metric is vehicles-per-household (the normalised choropleth); a toggle
 * switches to raw total registration records. Both values are derived from the
 * one aggregate pass and retained, so toggling never fires a new query.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type Graphic from "@arcgis/core/Graphic";

import { FilterPanel } from "../components/FilterPanel";
import { Legend } from "../components/Legend";
import type { LegendMode } from "../components/Legend";

import { loadData, getYearData } from "../engine/loadData";
import { aggregate } from "../engine/aggregate";
import { buildRenderer, getRendererStats, buildPerHouseholdRenderer, getPerHouseholdStats } from "../engine/renderer";
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
  p2: number;
  p98: number;
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

  // Builds the renderer, popup and legend stats for a metric from retained
  // values. Pure read of totals/perHH - no querying - so it serves both a
  // filter change and a metric toggle.
  const applyRendering = useCallback(
    (mode: LegendMode, totals: AggregateResult, perHH: PerHouseholdResult) => {
      if (mode === "per_household") {
        const perHHmap = new Map<string, number | null>();
        for (const pc of allPostcodes) perHHmap.set(pc, perHH.byPostcode.get(pc)?.vehiclesPerHousehold ?? null);
        layer.renderer = buildPerHouseholdRenderer(perHHmap, allPostcodes);
        const stats = getPerHouseholdStats(perHHmap, allPostcodes);
        setLegend({
          mode, p2: stats.p2, p98: stats.p98,
          noDataCount: allPostcodes.length - stats.withData,
          vicAvg: perHH.vicAvg,
        });
      } else {
        layer.renderer = buildRenderer(totals, allPostcodes);
        const stats = getRendererStats(totals);
        const nonZero = allPostcodes.filter((pc) => (totals.get(pc) ?? 0) > 0).length;
        setLegend({ mode, p2: stats.p2, p98: stats.p98, noDataCount: allPostcodes.length - nonZero, vicAvg: null });
      }
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
        setFilterState((p) => ({ ...p, year, makes: [], fuels: [] }));
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
      const yearNeedsLoad = !store!.yearCache.has(debouncedFilter.year);
      if (yearNeedsLoad) setBusy(true);
      try {
        const yearData = await getYearData(store!, debouncedFilter.year);
        if (cancelled) return;

        if (yearNeedsLoad) {
          setMakes(getMakesByFrequency(store!.meta, yearData));
          setFuels(getFuelsByFrequency(store!.meta, yearData));
        }

        let totals = cache.get(debouncedFilter);
        if (!totals) {
          totals = aggregate(debouncedFilter, store!.meta, yearData);
          cache.set(debouncedFilter, totals);
        }

        const perHH = computePerHousehold(totals, householdsByPostcode, allPostcodes, debouncedFilter.year);

        currentTotals.current = totals;
        onTotalsChange(totals);
        lastTotalsRef.current = totals;
        lastPerHHRef.current  = perHH;

        applyRendering(metricRef.current, totals, perHH);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilter]);

  // Metric toggle: re-render from retained values, no re-query.
  useEffect(() => {
    if (lastTotalsRef.current && lastPerHHRef.current) {
      applyRendering(metric, lastTotalsRef.current, lastPerHHRef.current);
    }
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
          p2={legend.p2}
          p98={legend.p98}
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
        `<div style="font-family:-apple-system,sans-serif;font-size:13px;padding:2px 0">
          <div><strong style="font-size:15px">${primary}</strong></div>
          <div style="color:#555;font-size:12px;margin-top:3px">${secondary}</div>
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
      // total mode: raw registration records, with per-household as context
      return wrap(
        `${records} registration records`,
        perHH == null ? "↳ No household data for this postcode" : `↳ ${perHH.toFixed(2)} vehicles per household`
      );
    },
  };
}
