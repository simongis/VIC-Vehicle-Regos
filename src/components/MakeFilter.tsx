import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MakeOption } from "../engine/metadata";

/**
 * Make single-select. A Ripple-styled control: a chip trigger on the dark filter
 * bar that opens a searchable, volume-ranked list. One make at a time (radio, not
 * tickboxes) - picking one filters the map and closes the menu; "All makes"
 * clears it.
 *
 * Each row shows the brand's favicon (pulled from the make's website via Google's
 * favicon service) with a graceful fallback to a coloured initials chip if it
 * can't load. The panel renders through a portal so the filter bar's
 * overflow:hidden can't clip it.
 */
interface Props {
  makes: MakeOption[];
  selected: string[];
  onChange: (codes: string[]) => void;
}

/** Make code -> brand website, for favicons. Unmapped makes fall back to initials. */
const MAKE_DOMAINS: Record<string, string> = {
  TOYOTA: "toyota.com", FORD: "ford.com", HOLDEN: "holden.com.au", MAZDA: "mazda.com",
  HYNDAI: "hyundai.com", NISSAN: "nissan.com.au", MITSUB: "mitsubishi-motors.com.au",
  HONDA: "honda.com", VOLKS: "volkswagen.com", "MERC B": "mercedes-benz.com", KIA: "kia.com",
  SUBARU: "subaru.com", "B M W": "bmw.com.au", ISUZU: "isuzuute.com.au", SUZUKI: "suzuki.com",
  AUDI: "audi.com", JEEP: "jeep.com", VOLVO: "volvocars.com", "M G": "mgmotor.com.au",
  LEXUS: "lexus.com", "L ROV": "landrover.com", REN: "renault.com", "H DAV": "harley-davidson.com",
  YAMAHA: "yamaha-motor.com", TESLA: "tesla.com", SKODA: "skoda-auto.com", PORSCH: "porsche.com",
  MINI: "mini.com", CHERY: "chery.com", BYD: "byd.com", GWM: "gwm.com.au",
};

function avatarColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${180 + (h % 160)}, 38%, 42%)`;
}
function initials(label: string): string {
  const parts = label.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

const ICON = 22;

/** Brand favicon with a coloured-initials fallback if the image fails to load. */
function BrandIcon({ code, label }: { code: string; label: string }) {
  const domain = MAKE_DOMAINS[code];
  const [failed, setFailed] = useState(false);
  if (domain && !failed) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?sz=64&domain=${domain}`}
        alt=""
        width={ICON}
        height={ICON}
        onError={() => setFailed(true)}
        style={{
          width: ICON, height: ICON, flexShrink: 0, borderRadius: 4, objectFit: "contain",
          background: "#fff", border: "1px solid var(--color-border)", padding: 1,
        }}
      />
    );
  }
  return (
    <span style={{
      width: ICON, height: ICON, flexShrink: 0, borderRadius: "50%",
      background: avatarColor(label), color: "#fff",
      fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
    }}>{initials(label)}</span>
  );
}

export function MakeFilter({ makes, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const grandTotal = makes.reduce((s, m) => s + m.total, 0) || 1;
  const q = query.trim().toLowerCase();
  const shown = q ? makes.filter((m) => m.label.toLowerCase().includes(q)) : makes;
  const current = selected[0];

  // Single-select: choosing a make replaces the selection and closes the menu.
  function pick(code: string | null) {
    onChange(code ? [code] : []);
    setOpen(false);
    setQuery("");
  }

  const selectedMake = makes.find((m) => m.code === current);
  const panelWidth = 320;
  const panelLeft = rect ? Math.min(rect.left, window.innerWidth - panelWidth - 8) : 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Filter by make"
        style={{
          height: 28, minWidth: 150, maxWidth: 240,
          display: "flex", alignItems: "center", gap: 8, padding: "0 10px",
          border: `1px solid ${current ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)"}`,
          borderRadius: "var(--radius-sm)",
          background: current ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)",
          color: "#fff", fontSize: 12, fontWeight: current ? 600 : 400,
          fontFamily: "var(--font-sans)", cursor: "pointer", outline: "none", whiteSpace: "nowrap",
        }}
      >
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>
          {selectedMake ? selectedMake.label : "All makes"}
        </span>
        <span aria-hidden style={{ fontSize: 9, opacity: 0.8 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          style={{
            position: "fixed", top: rect.bottom + 6, left: panelLeft, zIndex: 1000,
            width: panelWidth, maxHeight: "min(440px, calc(100vh - 110px))",
            display: "flex", flexDirection: "column",
            background: "var(--color-surface)", color: "var(--color-text)",
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)", fontFamily: "var(--font-sans)", overflow: "hidden",
          }}
        >
          <div style={{ padding: 10, borderBottom: "1px solid var(--color-border)" }}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search makes"
              style={{
                width: "100%", height: 32, padding: "0 10px", fontSize: 13,
                fontFamily: "var(--font-sans)", color: "var(--color-text)",
                border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-sm)", outline: "none",
              }}
            />
          </div>

          <div style={{ overflowY: "auto" }}>
            {/* All makes (clears the filter) */}
            {!q && (
              <Row selected={!current} onClick={() => pick(null)}>
                <span style={{
                  width: ICON, height: ICON, flexShrink: 0, borderRadius: "50%",
                  border: "1px dashed var(--color-border-strong)",
                }} />
                <span style={{ flex: 1, fontWeight: !current ? 600 : 400 }}>All makes</span>
                <Radio on={!current} />
              </Row>
            )}

            {shown.length === 0 && (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--color-text-subtle)" }}>No matches</div>
            )}
            {shown.map((m) => {
              const isSel = m.code === current;
              const pct = (m.total / grandTotal) * 100;
              return (
                <Row key={m.code || "__unknown__"} selected={isSel} onClick={() => pick(m.code)}>
                  <BrandIcon code={m.code} label={m.label} />
                  <span style={{ flex: 1, fontWeight: isSel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.label}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${Math.min(100, pct)}%`, background: "var(--color-blue-mid)" }} />
                    </span>
                    <span style={{ width: 38, textAlign: "right", color: "var(--color-text-subtle)", fontSize: 11 }}>
                      {pct < 0.1 ? "<0.1" : pct.toFixed(1)}%
                    </span>
                  </span>
                  <Radio on={isSel} />
                </Row>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/** A single clickable option row. */
function Row({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 12px", border: "none",
        borderLeft: `3px solid ${selected ? "var(--color-blue)" : "transparent"}`,
        background: selected ? "var(--color-blue-light)" : "transparent",
        cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13,
        color: "var(--color-text)", textAlign: "left",
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--color-surface-alt)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

/** Radio indicator (single-select). */
function Radio({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 16, height: 16, flexShrink: 0, borderRadius: "50%",
      border: `1.5px solid ${on ? "var(--color-blue)" : "var(--color-border-strong)"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-blue)" }} />}
    </span>
  );
}
