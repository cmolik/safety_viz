import { useMemo, useState } from "react";
import FilterSection, { ActiveBadge } from "./FilterSection";
import type { CategoryValue } from "../../utils/columnFilters";

type Props = {
  title: string;
  /** Distinct values (with counts) of the column, already sorted. */
  values: CategoryValue[];
  /** Currently hidden value keys. */
  excluded: Set<string>;
  /** Toggle a single value's visibility. */
  onToggle: (value: string) => void;
  /** Show all values (clear exclusions). */
  onSelectAll: () => void;
  /** Hide all values. */
  onSelectNone: () => void;
};

/**
 * Excel-style multiselect for a string column: search + Select all/none + a
 * scrollable checkbox list of distinct values. Mirrors the "Filter by Event
 * Type" control so the panel reads consistently. Unchecking a value hides its
 * rows everywhere (table, map, chart).
 */
export default function CategoryFilterSection({
  title,
  values,
  excluded,
  onToggle,
  onSelectAll,
  onSelectNone,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => v.label.toLowerCase().includes(q));
  }, [values, query]);

  const shownCount = values.length - excluded.size;
  const active = excluded.size > 0;

  return (
    <FilterSection
      title={title}
      badge={
        <ActiveBadge tone={active ? "active" : "muted"}>
          {active ? `${shownCount}/${values.length}` : `${values.length}/${values.length}`}
        </ActiveBadge>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search values…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="no-drag"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 8 }}
          />
          <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
            {shownCount}/{values.length}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="no-drag"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onSelectAll}
          >
            Select All
          </button>
          <button
            type="button"
            className="no-drag"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onSelectNone}
          >
            Select None
          </button>
        </div>

        <div
          role="group"
          aria-label={title}
          className="no-drag"
          style={{
            maxHeight: 220,
            overflow: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 6,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: 8, color: "#6b7280" }}>No results</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {filtered.map((v) => {
                const checked = !excluded.has(v.value);
                return (
                  <li key={v.value} className="no-drag" style={{ display: "flex" }}>
                    <label
                      className="no-drag"
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 8,
                        alignItems: "center",
                        padding: "5px 4px",
                        width: "100%",
                        cursor: "pointer",
                        borderRadius: 6,
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        className="no-drag"
                        checked={checked}
                        onChange={() => onToggle(v.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontStyle: v.value === "" ? "italic" : "normal",
                          color: v.value === "" ? "#6b7280" : "inherit",
                        }}
                        title={v.label}
                      >
                        {v.label}
                      </span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{v.count}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </FilterSection>
  );
}
