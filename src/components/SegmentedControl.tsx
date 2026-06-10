/**
 * The one segmented control. Replaces the four hand-rolled variants that had
 * drifted apart (metric toggle, timeline mode tabs, dominant-make mode toggle).
 * Styling lives in ui.css (.segmented) so every instance is identical.
 */
interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Stretch buttons to share the width equally (used inside cards). */
  fill?: boolean;
}

export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel, fill }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="segmented" style={fill ? { display: "flex" } : undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          style={fill ? { flex: 1 } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
