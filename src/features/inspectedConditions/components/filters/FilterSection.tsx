import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  /** Small element shown at the right of the header (e.g. an "active" badge). */
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

/**
 * Collapsible container for one dynamic filter. Keeps the Filters panel compact
 * when an indicator exposes many columns: sections start collapsed and show a
 * badge when active, so the panel reads as a tidy list of toggles.
 */
export default function FilterSection({ title, badge, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="filter-section no-drag"
      style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}
    >
      <button
        type="button"
        className="no-drag"
        aria-expanded={open}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "8px 10px",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <span
          aria-hidden
          style={{
            fontSize: 9,
            color: "#6b7280",
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform .15s",
          }}
        >
          ▶
        </span>
        <span className="filterHeader" style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
          {title}
        </span>
        {badge}
      </button>
      {open && <div style={{ padding: "0 10px 10px" }}>{children}</div>}
    </div>
  );
}

/**
 * Small pill used by filter sections to show state in the header. `active`
 * (green) means the filter is narrowing the data; `muted` (grey) is the neutral
 * "all shown / no constraint" state.
 */
export function ActiveBadge({
  children,
  tone = "active",
}: {
  children: ReactNode;
  tone?: "active" | "muted";
}) {
  const styles =
    tone === "active"
      ? { color: "#1f6b1f", background: "#e7f3e7", border: "1px solid #cfe6cf" }
      : { color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb" };
  return (
    <span
      style={{
        fontSize: 11,
        borderRadius: 999,
        padding: "1px 8px",
        whiteSpace: "nowrap",
        ...styles,
      }}
    >
      {children}
    </span>
  );
}
