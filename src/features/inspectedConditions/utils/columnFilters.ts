/**
 * Runtime helpers for the dynamic per-column filters.
 *
 * The controls live in the Filters panel and write `ColumnFilter` state into the
 * store keyed by raw column name. This module turns that state into a predicate
 * over a feature's raw row, and derives the distinct values / numeric bounds the
 * controls need from the loaded events. The schema decides *which* columns get a
 * control; these helpers only need the raw rows.
 */

import type { ColumnFilter, GeoJSONFeature } from "../store/dashboard.store";

/** Stable string key for a raw value; null/undefined collapse to "" (blank). */
const valueKey = (v: unknown): string => (v == null ? "" : String(v));

/**
 * Coerce a raw value to a number, treating null/undefined/blank as NaN. (Plain
 * `Number(null)` is 0, which would let empty numeric cells slip through range
 * filters and skew computed bounds.)
 */
const toNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  const s = String(v).trim();
  return s === "" ? NaN : Number(s);
};

type PreparedFilter =
  | { kind: "category"; col: string; excluded: Set<string> }
  | { kind: "range"; col: string; min: number | null; max: number | null };

/**
 * Build a predicate `(raw) => boolean` from the active column filters. Inactive
 * filters (no exclusions / no bounds) are dropped, so an all-default state is a
 * cheap pass-through.
 */
export function makeColumnPredicate(
  columnFilters: Record<string, ColumnFilter>,
): (raw: Record<string, unknown>) => boolean {
  const prepared: PreparedFilter[] = [];
  for (const [col, filt] of Object.entries(columnFilters)) {
    if (filt.kind === "category") {
      if (filt.excluded.length > 0) {
        prepared.push({ kind: "category", col, excluded: new Set(filt.excluded) });
      }
    } else if (filt.min != null || filt.max != null) {
      prepared.push({ kind: "range", col, min: filt.min, max: filt.max });
    }
  }

  if (prepared.length === 0) return () => true;

  return (raw: Record<string, unknown>): boolean => {
    for (const p of prepared) {
      const v = raw[p.col];
      if (p.kind === "category") {
        if (p.excluded.has(valueKey(v))) return false;
      } else {
        // A range filter drops rows whose value isn't a finite number.
        const n = toNumber(v);
        if (!Number.isFinite(n)) return false;
        if (p.min != null && n < p.min) return false;
        if (p.max != null && n > p.max) return false;
      }
    }
    return true;
  };
}

export type CategoryValue = {
  /** Raw key used for exclusion ("" = blank). */
  value: string;
  /** Human label ("(blank)" for the empty key). */
  label: string;
  /** How many events carry this value. */
  count: number;
};

/**
 * Distinct values of a raw column across all events, with counts. Sorted A→Z
 * with blanks last. Computed over all events (not the filtered subset) so the
 * list is stable while the user toggles values, like a spreadsheet filter.
 */
export function distinctValues(events: GeoJSONFeature[], col: string): CategoryValue[] {
  const counts = new Map<string, number>();
  for (const f of events) {
    const key = valueKey(f.properties.raw?.[col]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: CategoryValue[] = Array.from(counts, ([value, count]) => ({
    value,
    label: value === "" ? "(blank)" : value,
    count,
  }));
  out.sort((a, b) => {
    if (a.value === "") return 1;
    if (b.value === "") return -1;
    return a.label.localeCompare(b.label);
  });
  return out;
}

/** Min/max of a numeric column across all events, or null if none are numeric. */
export function numericBounds(
  events: GeoJSONFeature[],
  col: string,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  let any = false;
  for (const f of events) {
    const n = toNumber(f.properties.raw?.[col]);
    if (Number.isFinite(n)) {
      any = true;
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  return any ? { min, max } : null;
}
