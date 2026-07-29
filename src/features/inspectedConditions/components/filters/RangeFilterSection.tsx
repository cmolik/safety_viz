import FilterSection, { ActiveBadge } from "./FilterSection";

type Props = {
  title: string;
  /** Data min/max, shown as input placeholders. */
  bounds: { min: number; max: number } | null;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
};

const parse = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

/**
 * Min/max range control for a numeric column. Empty bound = open on that side.
 * Rows whose value isn't numeric are dropped once either bound is set.
 */
export default function RangeFilterSection({ title, bounds, min, max, onChange }: Props) {
  const active = min != null || max != null;
  const badge = active ? (
    <ActiveBadge tone="active">
      {min != null ? fmt(min) : "−∞"} … {max != null ? fmt(max) : "∞"}
    </ActiveBadge>
  ) : (
    <ActiveBadge tone="muted">any</ActiveBadge>
  );

  return (
    <FilterSection title={title} badge={badge}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            className="no-drag"
            placeholder={bounds ? `min ${fmt(bounds.min)}` : "min"}
            value={min ?? ""}
            onChange={(e) => onChange(parse(e.target.value), max)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 8 }}
          />
          <span style={{ color: "#6b7280" }}>–</span>
          <input
            type="number"
            className="no-drag"
            placeholder={bounds ? `max ${fmt(bounds.max)}` : "max"}
            value={max ?? ""}
            onChange={(e) => onChange(min, parse(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 8 }}
          />
        </div>
        {active && (
          <button
            type="button"
            className="no-drag"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onChange(null, null)}
            style={{ alignSelf: "flex-start" }}
          >
            Clear
          </button>
        )}
      </div>
    </FilterSection>
  );
}
