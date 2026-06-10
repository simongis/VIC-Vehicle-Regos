/**
 * Row 2 of the top bar: the per-view control strip. A light surface band
 * (the masthead above is the app's only dark band) holding the year picker,
 * the view title and any view-specific controls.
 *
 * Explore composes its own richer strip from the same ui.css classes; the
 * preset views (EV Advantage, Dominant Make, New vs Old, Trends) use this.
 */
import type { ReactNode } from "react";
import { YearSelect } from "./YearSelect";

interface Props {
  years: number[];
  year: number;
  onYearChange: (year: number) => void;
  /** View title, rendered as the strip's heading. */
  title: string;
  /** One-line plain-language reading hint, truncates on narrow screens. */
  note?: string;
  error?: string | null;
  busy?: boolean;
  /** Extra view-specific controls, placed after the title. */
  children?: ReactNode;
}

export function ControlStrip({ years, year, onYearChange, title, note, error, busy, children }: Props) {
  return (
    <div className="control-strip">
      <YearSelect years={years} value={year} onChange={onYearChange} />
      <div className="strip-divider" />
      <h2 className="strip-title">{title}</h2>
      {children}
      {note && <span className="strip-note">{note}</span>}
      {error && <span className="strip-error" role="alert">{error}</span>}
      {busy && <div className="busy-bar" />}
    </div>
  );
}
