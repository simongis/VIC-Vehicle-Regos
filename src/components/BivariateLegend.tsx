import { bivariateColor } from "../engine/bivariate";
import { MapCard } from "./MapCard";

interface Props {
  evT1: number;
  evT2: number;
  sesT1: number;
  sesT2: number;
}

const SWATCH = 28; // px per cell

export function BivariateLegend({ evT1, evT2, sesT1, sesT2 }: Props) {
  return (
    <MapCard
      title="EV ownership × socio-economic advantage"
      collapsible
      maxWidth={240}
      footer={
        <>
          <div>EV% breaks: ≤{evT1.toFixed(1)}% · ≤{evT2.toFixed(1)}% · higher</div>
          <div>SES breaks: ≤{sesT1} · ≤{sesT2} · higher (national percentile)</div>
          <div style={{ marginTop: 4 }}>
            Source: vehicle registration data + ABS SEIFA IRSAD 2021
          </div>
        </>
      }
    >
      {/* 3×3 swatch grid - EV high at top, SES high at right */}
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", userSelect: "none" }}>
        {/* Y-axis label */}
        <div
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: "var(--text-2xs)",
            color: "var(--color-text-subtle)",
            textAlign: "center",
            marginRight: 2,
            lineHeight: 1.2,
          }}
        >
          EV ownership % ↑
        </div>

        <div>
          {/* Grid: rows = EV class descending (high at top) */}
          {[2, 1, 0].map((evClass) => (
            <div key={evClass} style={{ display: "flex", gap: 2, marginBottom: 2 }}>
              {[0, 1, 2].map((sesClass) => {
                const cls = evClass * 3 + sesClass;
                return (
                  <div
                    key={sesClass}
                    title={`EV: ${["low", "med", "high"][evClass]} · SES: ${["low", "med", "high"][sesClass]}`}
                    style={{
                      width: SWATCH,
                      height: SWATCH,
                      background: bivariateColor(cls),
                      borderRadius: 2,
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  />
                );
              })}
            </div>
          ))}

          {/* X-axis label */}
          <div
            style={{
              fontSize: "var(--text-2xs)",
              color: "var(--color-text-subtle)",
              marginTop: 4,
              textAlign: "center",
            }}
          >
            Socio-economic advantage →
          </div>
        </div>
      </div>
    </MapCard>
  );
}
