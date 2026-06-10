/**
 * Floating card anchored bottom-left over the map - the shared container for
 * every legend. One implementation, one rhythm: title, optional subtitle,
 * content rows, optional footnote. Replaces the four per-view legend boxes.
 */
import { useState } from "react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  /** Secondary line under the title (e.g. the active filter summary). */
  subtitle?: string;
  /** Footnote below a hairline rule - methodology, caveats, source. */
  footer?: ReactNode;
  /** Allow minimising down to a small "Legend" restorer chip. */
  collapsible?: boolean;
  minWidth?: number;
  maxWidth?: number;
  children: ReactNode;
}

const MOBILE_BP = 768;

export function MapCard({ title, subtitle, footer, collapsible, minWidth, maxWidth, children }: Props) {
  // On mobile, legends start minimised so the map is usable on first load.
  const [minimised, setMinimised] = useState(() =>
    collapsible && typeof window !== "undefined" && window.innerWidth < MOBILE_BP
  );

  if (collapsible && minimised) {
    return (
      <button className="map-card-collapsed" onClick={() => setMinimised(false)}>
        Legend ▴
      </button>
    );
  }

  return (
    <div className="map-card" style={{ minWidth, maxWidth }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: subtitle ? 2 : 8 }}>
        <h2 className="map-card__title">{title}</h2>
        {collapsible && (
          <button className="map-card__mini" onClick={() => setMinimised(true)} aria-label="Minimise legend">
            ▾
          </button>
        )}
      </div>
      {subtitle && <div className="map-card__sub">{subtitle}</div>}
      {children}
      {footer && <div className="map-card__foot">{footer}</div>}
    </div>
  );
}

/** A standard legend row: swatch, label, optional right-aligned count. */
export function MapCardRow({ color, label, count, subtle }: {
  color: string;
  label: ReactNode;
  count?: ReactNode;
  subtle?: boolean;
}) {
  return (
    <div className="map-card__row">
      <span className="map-card__swatch" style={{ background: color }} />
      <span style={{ flex: 1, color: subtle ? "var(--color-text-subtle)" : undefined }}>{label}</span>
      {count != null && <span className="map-card__count">{count}</span>}
    </div>
  );
}
