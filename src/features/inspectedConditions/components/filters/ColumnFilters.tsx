import { useMemo } from "react";
import {
  useDashboardStore,
  useEvents,
  useIndicatorUri,
  useColumnFilters,
} from "../../store/dashboard.store";
import { useIndicatorSchema } from "../../hooks/useIndicatorSchema";
import { useEventFilter } from "../../hooks/useEventFilter";
import { filterableColumns, humanizeColumnName } from "../../utils/schemaFilters";
import { distinctValues, numericBounds, type CategoryValue } from "../../utils/columnFilters";
import CategoryFilterSection from "./CategoryFilterSection";
import RangeFilterSection from "./RangeFilterSection";

const EMPTY_EXCLUDED = new Set<string>();

/**
 * Schema-driven filters for the current indicator. String columns become
 * category multiselects and Integer/Double columns become numeric ranges;
 * position/date/URI/id/category columns are excluded (see `schemaFilters`).
 * Renders nothing outside indicator mode or when the schema exposes no
 * filterable columns.
 */
export default function ColumnFilters() {
  const indicatorUri = useIndicatorUri();
  const { schema } = useIndicatorSchema(indicatorUri);
  const events = useEvents();
  const columnFilters = useColumnFilters();
  const setColumnCategoryExcluded = useDashboardStore((s) => s.setColumnCategoryExcluded);
  const setColumnRange = useDashboardStore((s) => s.setColumnRange);

  const { categorical, numeric } = useMemo(() => filterableColumns(schema), [schema]);

  // Distinct values / bounds come from events that pass the OTHER active filters
  // (time, position, discrepancy) but not the column filters themselves — so the
  // lists match what the table can actually show. Without this, rows the backend
  // returns outside the requested date window would pad the lists with values
  // that never appear in the table.
  const baseMatches = useEventFilter({
    undatedPasses: false,
    applyPosition: true,
    applyColumnFilters: false,
  });
  const baseEvents = useMemo(() => (events ?? []).filter(baseMatches), [events, baseMatches]);

  const distinctByCol = useMemo(() => {
    const m = new Map<string, CategoryValue[]>();
    for (const col of categorical) m.set(col.name, distinctValues(baseEvents, col.name));
    return m;
  }, [baseEvents, categorical]);

  const boundsByCol = useMemo(() => {
    const m = new Map<string, { min: number; max: number } | null>();
    for (const col of numeric) m.set(col.name, numericBounds(baseEvents, col.name));
    return m;
  }, [baseEvents, numeric]);

  if (categorical.length === 0 && numeric.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "none" }}>
      {categorical.map((col) => {
        const values = distinctByCol.get(col.name) ?? [];
        const filt = columnFilters[col.name];
        const excluded =
          filt && filt.kind === "category" ? new Set(filt.excluded) : EMPTY_EXCLUDED;
        return (
          <CategoryFilterSection
            key={col.name}
            title={humanizeColumnName(col.name)}
            values={values}
            excluded={excluded}
            onToggle={(value) => {
              const next = new Set(excluded);
              if (next.has(value)) next.delete(value);
              else next.add(value);
              setColumnCategoryExcluded(col.name, [...next]);
            }}
            onSelectAll={() => setColumnCategoryExcluded(col.name, [])}
            onSelectNone={() => setColumnCategoryExcluded(col.name, values.map((v) => v.value))}
          />
        );
      })}

      {numeric.map((col) => {
        const filt = columnFilters[col.name];
        const min = filt && filt.kind === "range" ? filt.min : null;
        const max = filt && filt.kind === "range" ? filt.max : null;
        return (
          <RangeFilterSection
            key={col.name}
            title={humanizeColumnName(col.name)}
            bounds={boundsByCol.get(col.name) ?? null}
            min={min}
            max={max}
            onChange={(mn, mx) => setColumnRange(col.name, mn, mx)}
          />
        );
      })}
    </div>
  );
}
