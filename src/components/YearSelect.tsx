import { useEffect, useState } from "react";

/**
 * Year picker shared across every view. Lives at the leading edge of the Row 2
 * context strip so the year sits alongside the other filters (Explore) and in a
 * consistent spot in the preset strips.
 *
 * Ripple-styled light chip (readable dark-on-white options) plus a Play button
 * that steps through the years on a loop, updating the selection as it goes, so
 * you can watch the map animate over time. Picking a year manually still works
 * and pauses playback.
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
      <span style={{
        color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap",
      }}>
        Year
      </span>

      <button
        type="button"
        onClick={() => setPlaying((v) => !v)}
        title={playing ? "Pause playback" : "Play through the years"}
        aria-label={playing ? "Pause year playback" : "Play through the years"}
        aria-pressed={playing}
        style={{
          height: 28, width: 28, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${playing ? "var(--color-focus)" : "rgba(255,255,255,0.25)"}`,
          borderRadius: "var(--radius-sm)",
          background: playing ? "var(--color-focus)" : "rgba(255,255,255,0.06)",
          color: playing ? "#1a1a1a" : "#fff",
          cursor: "pointer", outline: "none", fontSize: 11, lineHeight: 1,
        }}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <select
        aria-label="Snapshot year"
        value={value}
        onChange={(e) => { setPlaying(false); onChange(Number(e.target.value)); }}
        style={{
          height: 28,
          padding: "0 26px 0 10px",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-sm)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--font-sans)",
          cursor: "pointer",
          outline: "none",
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%23003174' stroke-width='1.5'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 9px center",
        }}
      >
        {years.map((y) => (
          <option key={y} value={y} style={{ color: "#1a1a1a", background: "#fff" }}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
