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
    // Ripple primary-nav style: full-height tabs with a gold underline
    // indicator on the active item, not floating pills. Styling lives in
    // ui.css (.masthead-tab) so hover/focus/active are defined once.
    <nav aria-label="Views" style={{ display: "flex", alignItems: "stretch", gap: 2 }}>
      {VIEWS.map((v) => {
        const active = v.id === current;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            aria-current={active ? "page" : undefined}
            className="masthead-tab"
            title={v.label}
          >
            {v.shortLabel}
          </button>
        );
      })}
    </nav>
  );
}
