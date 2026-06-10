import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  TitleComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([ScatterChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer]);

export interface ScatterPoint {
  postcode: string;
  evPercent: number;
  seifa: number;
  classIndex: number;
}

interface Props {
  points: ScatterPoint[];
  /** Colours keyed by string classIndex, matching the map renderer. */
  classColors?: Map<string, string>;
  highlightPostcode?: string;
  onHover?: (postcode: string | null) => void;
  /** Fired when a point is clicked - the map zooms to that postcode. */
  onSelect?: (postcode: string) => void;
}

export function EVSESScatter({ points, classColors, highlightPostcode, onHover, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Keep the latest callbacks in refs so the chart is initialised exactly once.
  // (If they were effect deps, an unmemoised onSelect would dispose/recreate the
  // chart every render and the data effect would not re-run, leaving it blank.)
  const onHoverRef = useRef(onHover);
  const onSelectRef = useRef(onSelect);
  onHoverRef.current = onHover;
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    chart.on("mouseover", (params) => {
      if (params.componentType === "series" && params.data) {
        const d = params.data as [number, number, string, number];
        onHoverRef.current?.(d[2]);
      }
    });
    chart.on("mouseout", () => onHoverRef.current?.(null));
    chart.on("click", (params) => {
      if (params.componentType === "series" && params.data) {
        const d = params.data as [number, number, string, number];
        onSelectRef.current?.(d[2]);
      }
    });
    chart.getZr().on("globalout", () => onHoverRef.current?.(null));

    return () => { chart.dispose(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || points.length === 0) return;

    const data = points.map((p) => [p.evPercent, p.seifa, p.postcode, p.classIndex]);

    // Merge (not notMerge): on a year change this updates the existing series'
    // data in place so the points transition, rather than tearing down and
    // rebuilding the chart (which read as a flash during playback).
    chart.setOption({
      backgroundColor: "transparent",
      grid: { top: 36, right: 16, bottom: 48, left: 56 },
      tooltip: {
        trigger: "item",
        formatter: (params: { data: [number, number, string, number] }) => {
          const [ev, ses, pc] = params.data;
          return `<b>${pc}</b><br/>EV%: ${ev.toFixed(1)}%<br/>SES: ${ses} (national percentile)`;
        },
      },
      xAxis: {
        name: "EV Ownership %",
        nameLocation: "middle",
        nameGap: 28,
        type: "value",
        // Fixed 0-8% domain so the axis is stable across years and postcodes -
        // points move against a constant scale rather than the axis rescaling
        // under them. 8% comfortably clears the current top (CBD ~5.8%).
        min: 0,
        max: 8,
        splitLine: { lineStyle: { color: "#eee" } },
        axisLabel: { fontSize: 10, formatter: (v: number) => `${v.toFixed(0)}%` },
      },
      yAxis: {
        name: "Socio-economic advantage",
        nameLocation: "middle",
        nameGap: 42,
        type: "value",
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: "#eee" } },
        axisLabel: { fontSize: 10 },
      },
      series: [
        {
          type: "scatter",
          symbolSize: (d: [number, number, string, number]) => {
            return d[2] === highlightPostcode ? 12 : 5;
          },
          itemStyle: {
            color: (params: { data: [number, number, string, number] }) => {
              if (params.data[2] === highlightPostcode) return "#ff9e1b";
              // Use SmartMapping colour if available, else fall back to a neutral grey.
              return classColors?.get(String(params.data[3])) ?? "#888";
            },
            opacity: (params: { data: [number, number, string, number] }) =>
              params.data[2] === highlightPostcode ? 1 : 0.72,
            borderColor: "rgba(0,0,0,0.15)",
            borderWidth: 0.5,
          },
          data,
        },
      ],
    });
  }, [points, highlightPostcode]);

  useEffect(() => {
    const observer = new ResizeObserver(() => chartRef.current?.resize());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 0 }}
    />
  );
}
