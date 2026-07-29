/**
 * Per-schema configuration.
 *
 * The `/root-dashboard/indicators/data` endpoint returns a different row shape
 * per indicator, grouped by schema (see indicator-schemas.json). "Discrepancy"
 * (a finding) is defined differently per schema, so that knowledge lives here —
 * keyed by schema name — instead of hardcoding it per indicator.
 */

export type RawRow = Record<string, unknown>;

const isFilled = (v: unknown): boolean => v !== null && v !== undefined && v !== "";

/**
 * How to decide, per SCHEMA, whether a raw row is a discrepancy (a finding).
 * Keyed by schema name. Not universal:
 *  - `ghd` marks a finding by a filled `discrepancyId`.
 *  - `gse` (SI-7, SI-14, …) marks one by a filled `discrepancyType` OR
 *    `discrepancyId`. The `discrepancyType` value is itself the event type
 *    (category), so it isn't parsed here — only its presence matters.
 */
const SCHEMA_DISCREPANCY_PREDICATES: Record<string, (raw: RawRow) => boolean> = {
  ghd: (raw) => isFilled(raw.discrepancyId),
  gse: (raw) => isFilled(raw.discrepancyType) || isFilled(raw.discrepancyId),
};

/**
 * Returns the discrepancy predicate for the given schema, or null when the
 * schema is unknown / has no discrepancy concept (the UI then hides the
 * discrepancy filter).
 */
export function getDiscrepancyPredicate(
  schemaName: string | null | undefined,
): ((raw: RawRow) => boolean) | null {
  if (!schemaName) return null;
  return SCHEMA_DISCREPANCY_PREDICATES[schemaName] ?? null;
}

export type PrimaryColumn = { field: string; label: string };

/**
 * Schemas whose category ("event type") isn't a meaningful classification — for
 * `gse`, `discrepancyType` values like "Vše OK" actually mark that a discrepancy
 * WAS found (inverted), so they're useless as a type. For these, the Event Type
 * filter is hidden and the table shows this raw column instead. null = normal
 * event-type behavior.
 */
const SCHEMA_PRIMARY_COLUMN: Record<string, PrimaryColumn> = {
  gse: { field: "note", label: "Note" },
};

export function getSchemaPrimaryColumn(
  schemaName: string | null | undefined,
): PrimaryColumn | null {
  if (!schemaName) return null;
  return SCHEMA_PRIMARY_COLUMN[schemaName] ?? null;
}
