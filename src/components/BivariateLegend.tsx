import { bivariateColor } from "../engine/bivariate";

interface Props {
  evT1: number;
  evT2: number;
  sesT1: number;
  sesT2: number;
}

const SWATCH = 28; // px per cell

export function BivariateLegend({ evT1, evT2, sesT1, sesT2 }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 32,
        left: 12,
        zIndex: 10,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        boxShadow: "var(--shadow-md)",
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        color: "var(--color-text)",
        userSelect: "none",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12 }}>
        Electric Car Ownership × Socio-economic Status
      </div>

      {/* 3×3 swatch grid - EV high at top, SES high at right */}
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
        {/* Y-axis label */}
        <div
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 10,
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
              fontSize: 10,
              color: "var(--color-text-subtle)",
              marginTop: 4,
              textAlign: "center",
            }}
          >
            Socio-economic advantage →
          </div>
        </div>
      </div>

      {/* Tertile ranges */}
      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid var(--color-border)",
          fontSize: 10,
          color: "var(--color-text-subtle)",
          lineHeight: 1.6,
        }}
      >
        <div>EV% breaks: ≤{evT1.toFixed(1)}% · ≤{evT2.toFixed(1)}% · higher</div>
        <div>SES breaks: ≤{sesT1} · ≤{sesT2} · higher (national percentile)</div>
        <div style={{ marginTop: 4 }}>
          Source: vehicle registration data + ABS SEIFA IRSAD 2021
        </div>
      </div>
    </div>
  );
}
