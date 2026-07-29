import { useMemo, useCallback } from "react";
import {
  useDashboardStore,
  useEventTypesAll,
  useSelectedTypeIds,
  useEventTypesQuery,
  useVisualization,
  VisualizationMode,
  type EventType,
} from "../../store/dashboard.store";
import { colorByType as colorByTypeInDomain } from "@lib/colorScales";
import FilterSection, { ActiveBadge } from "./FilterSection";

export default function EventTypeFilter() {
  const all = useEventTypesAll();                 // [{ id, label }, ...]
  const isEmpty = !all || all.length === 0;

  const _selectedIds = useSelectedTypeIds();
  const selectedIds = useMemo(
    () => _selectedIds ?? [],
    [_selectedIds]
  );
  const query = useEventTypesQuery() ?? "";       // text filtr
  const visualization = useVisualization();       // VisualizationMode

  const setQuery    = useDashboardStore((s) => s.setEventTypesQuery);
  const setSelected = useDashboardStore((s) => s.setEventTypesSelected);

  // coloring function
  const typeDomain = useMemo(() => all.map((t) => t.id), [all]);
  const colorByType = useCallback(
    (id: string) => colorByTypeInDomain(id, typeDomain),
    [typeDomain]
  );

  const filtered: EventType[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => t.label.toLowerCase().includes(q));
  }, [all, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleOne = (id: string) => {
    const next = selectedSet.has(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setSelected(next);
  };

  const selectAll = () => setSelected(all.map((t) => t.id));
  const selectNone = () => setSelected([]);

  const allSelected = selectedIds.length === all.length && all.length > 0;

  return (
    <FilterSection
      title="Event type"
      defaultOpen
      badge={
        <ActiveBadge tone={allSelected ? "muted" : "active"}>
          {selectedIds.length}/{all.length}
        </ActiveBadge>
      }
    >
      <div
        className="no-drag"
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {/* Search + Reset */}
        <div
          className="no-drag"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            placeholder="Search event types…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="no-drag"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 8 }}
          />
          <button
            type="button"
            className="no-drag"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setQuery("")}
          >
            Reset
          </button>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {selectedIds.length}/{all.length}
          </span>
        </div>

        {/* bulk actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="no-drag"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={selectAll}
          >
            Select All
          </button>
          <button
            type="button"
            className="no-drag"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={selectNone}
          >
            Select None
          </button>
        </div>

        {/* value list */}
        <div
          role="group"
          aria-label="Event types"
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
          ) : isEmpty ? (
            <div style={{ padding: 8, fontStyle: "italic", color: "#666" }}>
              No event types to display (check API connection).
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {filtered.map((t) => {
                const checked = selectedSet.has(t.id);
                const showColor = visualization === VisualizationMode.Type;
                const checkboxId = `evt-${t.id}`;

                const onRowKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    toggleOne(t.id);
                  }
                };

                return (
                  <li key={t.id} className="no-drag" style={{ display: "flex" }}>
                    <div
                      className="no-drag"
                      role="checkbox"
                      aria-checked={checked}
                      tabIndex={0}
                      onClick={() => toggleOne(t.id)}
                      onKeyDown={onRowKeyDown}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto auto 1fr",
                        gap: 8,
                        alignItems: "center",
                        padding: "6px 4px",
                        width: "100%",
                        cursor: "pointer",
                        borderRadius: 6,
                        userSelect: "none",
                      }}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="no-drag"
                        checked={checked}
                        onChange={() => toggleOne(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      />

                      {showColor ? (
                        <span
                          aria-hidden
                          style={{
                            width: 18,
                            height: 12,
                            borderRadius: 6,
                            background: colorByType(t.id),
                            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)",
                          }}
                        />
                      ) : (
                        <span style={{ width: 18 }} />
                      )}

                      <label
                        htmlFor={checkboxId}
                        className="no-drag"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {t.label}
                      </label>
                    </div>
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
