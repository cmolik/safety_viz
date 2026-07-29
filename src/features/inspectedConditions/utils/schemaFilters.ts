/**
 * Decides which schema columns become dynamic filter controls, and how to label
 * them. Excluded (per the feature's design):
 *   - wkt:point  — the map already covers position
 *   - dateTime   — the time filter already covers dates
 *   - URI        — identifiers, not meaningful to filter on
 *   - id-like    — `discrepancyId`, `*Id`, `id` (and other identifiers)
 *   - category source fields — already offered by "Filter by Event Type"
 * String columns become category (multiselect) filters; Integer/Double become
 * numeric range filters.
 */

import type { IndicatorSchema, SchemaColumn } from "../api/schemas";
import { CATEGORY_SOURCE_FIELDS } from "../api/inspectedConditions";

const EXCLUDED_TYPES = new Set(["wkt:point", "dateTime", "URI"]);
const CATEGORY_FIELDS = new Set<string>(CATEGORY_SOURCE_FIELDS);

/** Identifier columns (`id`, `discrepancyId`, `inspectionTypeId`, …). */
function isIdColumn(name: string): boolean {
  return name.toLowerCase() === "id" || /Id$/.test(name);
}

function isFilterable(col: SchemaColumn): boolean {
  if (EXCLUDED_TYPES.has(col.dataType)) return false;
  if (isIdColumn(col.name)) return false;
  if (CATEGORY_FIELDS.has(col.name)) return false;
  return true;
}

export type FilterableColumns = {
  /** String columns → category multiselect filters. */
  categorical: SchemaColumn[];
  /** Integer/Double columns → numeric range filters. */
  numeric: SchemaColumn[];
};

/** Split a schema's columns into the filter controls it should produce. */
export function filterableColumns(schema: IndicatorSchema | null | undefined): FilterableColumns {
  const categorical: SchemaColumn[] = [];
  const numeric: SchemaColumn[] = [];
  if (!schema) return { categorical, numeric };
  for (const col of schema.columns) {
    if (!isFilterable(col)) continue;
    if (col.dataType === "String") categorical.push(col);
    else if (col.dataType === "Integer" || col.dataType === "Double") numeric.push(col);
  }
  return { categorical, numeric };
}

/** "organizationName" → "Organization name", "inspectionNotes" → "Inspection notes". */
export function humanizeColumnName(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
