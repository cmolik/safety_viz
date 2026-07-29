import { useMemo } from "react";
import {
  useSelectedTypeIds,
  useTimeFilter,
  useEventTypesAll,
  useWithPosition,
  useIncludeWithoutPosition,
  useShowDiscrepancy,
  useShowNonDiscrepancy,
  useIndicatorUri,
  useHasGeometry,
  useColumnFilters,
  type GeoJSONFeature,
} from "../store/dashboard.store";
import { getFeatureTypeId, hasPosition, makeInTime } from "../utils/featureAccess";
import { getDiscrepancyPredicate, getSchemaPrimaryColumn, type RawRow } from "../utils/indicatorProfile";
import { makeColumnPredicate } from "../utils/columnFilters";
import { useIndicatorSchema } from "./useIndicatorSchema";

export type EventFilterOptions = {
  /** Keep features whose date can't be placed in the time window (map does; table/chart don't). */
  undatedPasses: boolean;
  /** Apply the "without position" rule (map draws only geo points, so it opts out). */
  applyPosition: boolean;
  /**
   * Apply the dynamic per-column filters (default true). The column-filter UI
   * itself sets this false so its distinct-value lists reflect the other active
   * filters (time, position, …) rather than the raw loaded set — the backend can
   * return rows outside the requested window, which would otherwise pad the lists
   * with values that never appear in the table.
   */
  applyColumnFilters?: boolean;
};

/**
 * Single source of truth for filtering features by the active filters
 * (selected types + time + position + discrepancies). Returns a memoized
 * predicate; callers do `events.filter(predicate)`. This replaces the
 * previously duplicated filter logic in the table, map and chart, so new
 * filters are added here once.
 */
export function useEventFilter(opts: EventFilterOptions): (f: GeoJSONFeature) => boolean {
  const { undatedPasses, applyPosition, applyColumnFilters = true } = opts;
  const selectedIds = useSelectedTypeIds();
  const time = useTimeFilter();
  const allTypes = useEventTypesAll();
  const withPosition = useWithPosition();
  const includeWithoutPosition = useIncludeWithoutPosition();
  const showDiscrepancy = useShowDiscrepancy();
  const showNonDiscrepancy = useShowNonDiscrepancy();
  const indicatorUri = useIndicatorUri();
  const { schema } = useIndicatorSchema(indicatorUri);
  const schemaName = schema?.name ?? null;
  const hasGeometry = useHasGeometry();
  const columnFilters = useColumnFilters();
  const now = useMemo(() => Date.now(), []);

  return useMemo(() => {
    const selectedSet = new Set(selectedIds ?? []);
    const labelToId = new Map<string, string>();
    for (const t of allTypes) labelToId.set(t.label, t.id);

    const inTime = makeInTime(time, now, undatedPasses);
    // Per-schema discrepancy classifier, if this indicator's schema defines one.
    // The two checkboxes independently keep discrepancy / non-discrepancy rows;
    // when both are on (default) the rule is a no-op and is skipped.
    const discrepancyPred = getDiscrepancyPredicate(schemaName);
    const applyDiscrepancy = !!discrepancyPred && !(showDiscrepancy && showNonDiscrepancy);
    // Schemas with an inverted/meaningless category hide the Event Type filter,
    // so there's no type selection to honour — skip that check for them.
    const suppressEventType = getSchemaPrimaryColumn(schemaName) != null;
    // Dynamic per-column filters (schema-driven string/number controls).
    const columnPred = applyColumnFilters ? makeColumnPredicate(columnFilters) : null;

    return (f: GeoJSONFeature): boolean => {
      if (!suppressEventType && !selectedSet.has(getFeatureTypeId(f, labelToId))) return false;
      if (!inTime(f.properties.date)) return false;
      // Position rule (only meaningful when the dataset has geometry): the two
      // checkboxes independently keep with-position and without-position rows.
      if (applyPosition && hasGeometry) {
        const pos = hasPosition(f);
        if (pos && !withPosition) return false;
        if (!pos && !includeWithoutPosition) return false;
      }
      if (applyDiscrepancy) {
        const isDisc = discrepancyPred!((f.properties.raw ?? {}) as RawRow);
        if (isDisc && !showDiscrepancy) return false;
        if (!isDisc && !showNonDiscrepancy) return false;
      }
      if (columnPred && !columnPred((f.properties.raw ?? {}) as Record<string, unknown>)) return false;
      return true;
    };
  }, [
    selectedIds,
    time,
    allTypes,
    withPosition,
    includeWithoutPosition,
    showDiscrepancy,
    showNonDiscrepancy,
    schemaName,
    hasGeometry,
    columnFilters,
    now,
    undatedPasses,
    applyPosition,
    applyColumnFilters,
  ]);
}
