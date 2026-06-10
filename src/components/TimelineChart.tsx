/**
 * Quarterly fleet-trends chart (ECharts). Two modes:
 *  - "ev":  EV registration count (bars) + EV share of registrations % (line), dual axis.
 *           The headline electrification story.
 *  - "mix": stacked area of every fuel's registration count - fleet composition,
 *           where petrol dominates and the minor fuels' trajectories show.
 * The currently-selected global year is highlighted with a faint band.
 */
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { FUEL_LABELS } from "../types";
import type { TimelineEntry } from "../types";

echarts.use([
  LineChart, BarChart, GridComponent, TooltipComponent,
  LegendComponent, MarkAreaComponent, CanvasRenderer,
]);

export type TimelineMode = "ev" | "mix";

interface Props {
  entries: TimelineEntry[];
  mode: TimelineMode;
  highlightYear?: number;
}

// Fuel display order (petrol/diesel first - they carry the fleet) and colours.
const FUEL_ORDER = ["P", "D", "M", "G", "E", "O"] as const;
const FUEL_COLOURS: Record<string, string> = {
  P: "#8a9099", // Petrol - neutral grey, it's the baseline
  D: "#b5651d", // Diesel - amber-brown
  M: "#5b8fb0", // Multi/Dual - steel blue
  G: "#c9a227", // Gas - gold
  E: "#00a37a", // Electric - green hero
  O: "#c0c0c0", // Other - pale grey
};

interface Quarter {
  label: string;
  year: number;
  byFuel: Record<string, number>;
  total: number;
}

function buildQuarters(entries: TimelineEntry[]): Quarter[] {
  const map = new Map<string, Quarter>();
  for (const e of entries) {
    const key = `${e.year}-${e.quarter}`;
    let q = map.get(key);
    if (!q) {
      q = { label: `${e.year} Q${e.quarter}`, year: e.year, byFuel: {}, total: 0 };
      map.set(key, q);
    }
    q.byFuel[e.fuel] = (q.byFuel[e.fuel] ?? 0) + e.total;
    q.total += e.total;
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function highlightBand(quarters: Quarter[], year?: number) {
  if (!year) return undefined;
  const idxs = quarters.map((q, i) => (q.year === year ? i : -1)).filter((i) => i >= 0);
  if (idxs.length === 0) return undefined;
  return {
    silent: true,
    itemStyle: { color: "rgba(0,49,116,0.06)" },
    data: [[
      { xAxis: quarters[idxs[0]].label },
      { xAxis: quarters[idxs[idxs.length - 1]].label },
    ]],
  };
}

export function TimelineChart({ entries, mode, highlightYear }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const quarters = useMemo(() => buildQuarters(entries), [entries]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    return () => { chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || quarters.length === 0) return;

    const labels = quarters.map((q) => q.label);
    const band = highlightBand(quarters, highlightYear);

    const option =
      mode === "ev"
        ? {
            backgroundColor: "transparent",
            grid: { top: 48, right: 64, bottom: 56, left: 72 },
            legend: { top: 8, data: ["EV registrations", "EV share of registrations"] },
            tooltip: {
              trigger: "axis",
              valueFormatter: undefined,
              formatter: (ps: { dataIndex: number }[]) => {
                const i = ps[0].dataIndex;
                const q = quarters[i];
                const ev = q.byFuel.E ?? 0;
                const share = q.total > 0 ? (ev / q.total) * 100 : 0;
                return `<b>${q.label}</b><br/>EV registrations: ${ev.toLocaleString()}` +
                  `<br/>EV share: ${share.toFixed(2)}%` +
                  `<br/>Total registrations: ${q.total.toLocaleString()}`;
              },
            },
            xAxis: {
              type: "category", data: labels,
              axisLabel: { fontSize: 10, interval: 0, rotate: 40 },
            },
            yAxis: [
              {
                type: "value", name: "EV registrations", nameLocation: "middle", nameGap: 52,
                axisLabel: { fontSize: 10, formatter: (v: number) => `${(v / 1000).toFixed(0)}k` },
                splitLine: { lineStyle: { color: "#eee" } },
              },
              {
                type: "value", name: "EV share of registrations", nameLocation: "middle", nameGap: 40,
                axisLabel: { fontSize: 10, formatter: (v: number) => `${v.toFixed(1)}%` },
                splitLine: { show: false },
              },
            ],
            series: [
              {
                name: "EV registrations", type: "bar", yAxisIndex: 0,
                itemStyle: { color: FUEL_COLOURS.E, borderRadius: [2, 2, 0, 0] },
                data: quarters.map((q) => q.byFuel.E ?? 0),
                ...(band ? { markArea: band } : {}),
              },
              {
                name: "EV share of registrations", type: "line", yAxisIndex: 1, smooth: true,
                symbol: "circle", symbolSize: 6,
                lineStyle: { color: "#003174", width: 2.5 },
                itemStyle: { color: "#003174" },
                data: quarters.map((q) => (q.total > 0 ? +((q.byFuel.E ?? 0) / q.total * 100).toFixed(3) : 0)),
              },
            ],
          }
        : {
            backgroundColor: "transparent",
            grid: { top: 48, right: 24, bottom: 56, left: 72 },
            legend: {
              top: 8,
              data: FUEL_ORDER.map((f) => FUEL_LABELS[f] ?? f),
            },
            tooltip: {
              trigger: "axis",
              formatter: (ps: { dataIndex: number }[]) => {
                const i = ps[0].dataIndex;
                const q = quarters[i];
                let s = `<b>${q.label}</b>`;
                for (const f of FUEL_ORDER) {
                  const v = q.byFuel[f] ?? 0;
                  if (v === 0) continue;
                  const pct = q.total > 0 ? (v / q.total) * 100 : 0;
                  s += `<br/>${FUEL_LABELS[f] ?? f}: ${v.toLocaleString()} (${pct.toFixed(1)}%)`;
                }
                return s;
              },
            },
            xAxis: {
              type: "category", data: labels, boundaryGap: false,
              axisLabel: { fontSize: 10, interval: 0, rotate: 40 },
            },
            yAxis: {
              type: "value", name: "Registrations", nameLocation: "middle", nameGap: 54,
              axisLabel: { fontSize: 10, formatter: (v: number) => `${(v / 1e6).toFixed(1)}M` },
              splitLine: { lineStyle: { color: "#eee" } },
            },
            series: FUEL_ORDER.map((f, idx) => ({
              name: FUEL_LABELS[f] ?? f, type: "line", stack: "fleet", areaStyle: {},
              smooth: true, symbol: "none",
              lineStyle: { width: 0 },
              itemStyle: { color: FUEL_COLOURS[f] },
              data: quarters.map((q) => q.byFuel[f] ?? 0),
              ...(idx === 0 && band ? { markArea: band } : {}),
            })),
          };

    chart.setOption(option, true);
  }, [quarters, mode, highlightYear]);

  useEffect(() => {
    const observer = new ResizeObserver(() => chartRef.current?.resize());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 0 }} />;
}
