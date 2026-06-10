export type ViewId = "explore" | "ev-ses" | "dominant-make" | "new-vs-old" | "timeline";

interface ViewDef {
  id: ViewId;
  label: string;
  shortLabel: string;
}

export const VIEWS: ViewDef[] = [
  { id: "explore",       label: "Explore",       shortLabel: "Explore" },
  { id: "ev-ses",        label: "EV Advantage",  shortLabel: "EV Advantage" },
  { id: "dominant-make", label: "Dominant Make", shortLabel: "Dominant Make" },
  { id: "new-vs-old",    label: "New vs Old",    shortLabel: "New vs Old" },
  { id: "timeline",      label: "Registration Trends",  shortLabel: "Trends" },
];

interface Props {
  current: ViewId;
  onChange: (id: ViewId) => void;
}

export function ViewSwitcher({ current, onChange }: Props) {
  return (
    <nav aria-label="Views" style={{ display: "flex", alignItems: "stretch", gap: 2 }}>
      {VIEWS.map((v) => {
        const active = v.id === current;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            aria-current={active ? "page" : undefined}
            className="rpl-tab"
            style={{
              // Ripple primary-nav style: full-height tab with a gold underline
              // indicator on the active item, not a floating pill.
              height: "100%",
              padding: "0 14px",
              border: "none",
              borderBottom: active ? "3px solid var(--color-gold)" : "3px solid transparent",
              background: "transparent",
              color: active ? "#fff" : "rgba(255,255,255,0.66)",
              fontSize: 13,
              fontFamily: "var(--font-sans)",
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 120ms ease, border-color 120ms ease",
              outline: "none",
            }}
            title={v.label}
          >
            {v.shortLabel}
          </button>
        );
      })}
      <style>{`
        .rpl-tab:hover { color: #fff !important; border-bottom-color: rgba(255,255,255,0.45) !important; }
        .rpl-tab:focus-visible { box-shadow: inset 0 0 0 2px var(--color-focus); }
      `}</style>
    </nav>
  );
}
