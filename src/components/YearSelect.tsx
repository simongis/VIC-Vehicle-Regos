import { useEffect, useState } from "react";

/**
 * Year picker shared across every view. Lives at the leading edge of the Row 2
 * control strip so the year sits alongside the other filters (Explore) and in a
 * consistent spot in the preset strips.
 *
 * A select in the standard chip family plus a Play button that steps through
 * the years on a loop, updating the selection as it goes, so you can watch the
 * map animate over time. Picking a year manually still works and pauses playback.
 */
interface Props {
  years: number[];
  value: number;
  onChange: (year: number) => void;
}

const STEP_MS = 1400;

export function YearSelect({ years, value, onChange }: Props) {
  const [playing, setPlaying] = useState(false);

  // While playing, advance to the next year (chronological, looping) one step
  // per render. Re-running on `value` change is what produces each subsequent
  // step; manual selection simply feeds in a new value.
  useEffect(() => {
    if (!playing || years.length < 2) return;
    const ordered = [...years].sort((a, b) => a - b);
    const i = ordered.indexOf(value);
    const next = ordered[(i + 1) % ordered.length];
    const t = setTimeout(() => onChange(next), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, value, years, onChange]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <span className="strip-label">Year</span>

      <button
        type="button"
        className="icon-btn"
        onClick={() => setPlaying((v) => !v)}
        title={playing ? "Pause playback" : "Play through the years"}
        aria-label={playing ? "Pause year playback" : "Play through the years"}
        aria-pressed={playing}
        style={{ fontSize: 10 }}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <select
        className="select-chip"
        aria-label="Snapshot year"
        value={value}
        onChange={(e) => { setPlaying(false); onChange(Number(e.target.value)); }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
