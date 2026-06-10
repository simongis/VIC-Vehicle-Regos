import { CLASS_COLORS } from "../engine/renderer";
import { classIndexFor } from "../engine/fixedStretch";
import { MapCard, MapCardRow } from "./MapCard";

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

  return (
    <MapCard title={title} subtitle={filterLabel} collapsible minWidth={210} footer={
      <>
        Class breaks held constant {yearSpan[0]}–{yearSpan[1]}, so years compare directly.<br />
        {perHH
          ? "Registered vehicles (quarterly average) per ABS household."
          : "Estimated standing fleet = registration records ÷ quarters in the year."}
      </>
    }>
      {CLASS_COLORS.map((color, i) => (
        <MapCardRow
          key={i}
          color={color}
          count={counts[i]}
          label={
            <>
              {labels[i]}
              {avgClass === i && (
                <span
                  style={{ color: "var(--color-text-subtle)", marginLeft: 6 }}
                  title={`Victorian average: ${vicAvg!.toFixed(1)}`}
                >
                  ◂ Vic avg {vicAvg!.toFixed(1)}
                </span>
              )}
            </>
          }
        />
      ))}
      <MapCardRow color="#d9d9d9" label="No data" count={noDataCount} subtle />
    </MapCard>
  );
}

/** 1.5 -> "1.5", 2 -> "2" (cleaner break labels than a forced decimal). */
function trimZeros(v: number): string {
  return Number(v.toFixed(2)).toString();
}
