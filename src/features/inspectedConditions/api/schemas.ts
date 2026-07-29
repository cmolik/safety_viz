/**
 * Indicator data schemas.
 *
 * Each indicator's data endpoint returns a different set of columns. A schema
 * describes those columns (name + data type) and lists the indicator URIs that
 * use it. This is the catalog that will drive the per-indicator filter UI
 * (which fields exist, and how to render a control for each).
 *
 * MOCK: currently served as a static file from `public/mock-data/` so the app
 * loads it over HTTP exactly like a real endpoint. To move to the backend,
 * replace the `fetch` in `fetchIndicatorSchemas` with an `ApiClient.get(...)`
 * call (and drop the caching if the client already caches) — nothing else about
 * the shape or consumers changes.
 */

/** Data types seen in the schema; open-ended so unknown backend types still fit. */
export type SchemaDataType =
  | "String"
  | "dateTime"
  | "Double"
  | "Integer"
  | "wkt:point"
  | "URI"
  | (string & {});

export type SchemaColumn = {
  name: string;
  dataType: SchemaDataType;
  /** e.g. "yyyy-MM-dd'T'HH:mmX" for dateTime, "POINT(long lat)" for wkt; else null. */
  format: string | null;
  stable: boolean;
};

export type IndicatorSchema = {
  /** Schema id, e.g. "ghd", "gse", "aims", "occurrence", "safety-briefs". */
  name: string;
  /** URIs of the indicators that use this schema. */
  indicators: string[];
  columns: SchemaColumn[];
};

// Served from public/ for now; swap for the real endpoint here when available.
const SCHEMAS_URL = `${import.meta.env.BASE_URL}mock-data/indicator-schemas.json`;

let cache: Promise<IndicatorSchema[]> | null = null;

/** Load all indicator schemas (cached for the session). */
export function fetchIndicatorSchemas(): Promise<IndicatorSchema[]> {
  if (!cache) {
    cache = fetch(SCHEMAS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load indicator schemas: ${res.status}`);
        return res.json() as Promise<IndicatorSchema[]>;
      })
      .catch((e) => {
        cache = null; // let a later call retry instead of caching the failure
        throw e;
      });
  }
  return cache;
}

/** The schema that owns the given indicator URI, or null if none matches. */
export function schemaForIndicator(
  schemas: IndicatorSchema[],
  indicatorUri: string | null | undefined,
): IndicatorSchema | null {
  if (!indicatorUri) return null;
  return schemas.find((s) => s.indicators.includes(indicatorUri)) ?? null;
}
