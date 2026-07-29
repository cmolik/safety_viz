import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// Status color legend, in the same order/colors as the indicator value colors.
const LEGEND: { color: string; label: string }[] = [
  { color: "#22c55e", label: "Target" },
  { color: "#f59e0b", label: "Warning" },
  { color: "#ef4444", label: "Alert" },
];

/**
 * Small "i" icon button shown next to the Indicators panel title. Hovering it
 * pops up a dark panel (same style as the indicator-name tooltip) explaining the
 * status colors: a color dot + label for Target / Warning / Alert.
 */
export default function StatusLegendButton() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 8 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Status color legend"
        className="no-drag"
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={(e) => { e.stopPropagation(); if (pos) hide(); else show(); }}
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          borderRadius: "50%",
          border: "1px solid #9ca3af",
          background: "white",
          color: "#6b7280",
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontWeight: 700,
          fontSize: 12,
          lineHeight: 1,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        i
      </button>

      {pos && createPortal(
        <div style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          zIndex: 2000,
          padding: "8px 10px",
          backgroundColor: "#1f2937",
          color: "white",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          pointerEvents: "none",
        }}>
          {LEGEND.map((row) => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: row.color,
                flexShrink: 0,
              }} />
              <span>{row.label}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
