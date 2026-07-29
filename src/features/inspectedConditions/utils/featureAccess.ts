import { PresetTimeFilter, type GeoJSONFeature, type FilterState } from "../store/dashboard.store";

/** A feature has a usable position when it has coordinates that aren't 0,0. */
export function hasPosition(f: Pick<GeoJSONFeature, "geometry">): boolean {
  if (!f.geometry || !f.geometry.coordinates) return false;
  const [lon, lat] = f.geometry.coordinates;
  return lon !== 0 || lat !== 0;
}

/**
 * Resolve the type id used for selection/coloring. Prefers the explicit
 * `typeId`; otherwise maps the display `name` back to an id via the type
 * catalog, falling back to the name itself.
 */
export function getFeatureTypeId(f: GeoJSONFeature, labelToId: Map<string, string>): string {
  const typeId = f.properties.typeId;
  if (typeof typeId === "string" && typeId.length > 0) return typeId;
  return labelToId.get(f.properties.name) ?? f.properties.name;
}

/**
 * Local-midnight timestamp of a "yyyy-mm-dd" (or ISO) date string, shifted by
 * `dayOffset` whole days. Built from parts via `new Date(y, m, d)` so it lands on
 * LOCAL midnight (not UTC) and handles month/DST rollover. Returns NaN if the
 * string can't be parsed.
 */
function localDayStartMs(dateStr: string, dayOffset: number): number {
  const parts = dateStr.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d + dayOffset).getTime();
}

/**
 * Build a predicate that tests whether a feature's date falls inside the active
 * time filter. `undatedPasses` controls the "can't determine" cases (missing or
 * invalid date, or an incomplete custom range): the map keeps such features,
 * the table/chart drop them.
 */
export function makeInTime(
  time: FilterState["time"],
  now: number,
  undatedPasses: boolean,
): (iso?: string) => boolean {
  return (iso?: string) => {
    if (!iso) return undatedPasses;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return undatedPasses;
    if (time.preset === PresetTimeFilter.Past7Days) return now - t <= 7 * 24 * 3600_000;
    if (time.preset === PresetTimeFilter.Past30Days) return now - t <= 30 * 24 * 3600_000;
    if (time.preset === PresetTimeFilter.Custom && time.start && time.end) {
      // Inclusive of both the whole start and end days, on LOCAL day boundaries
      // to match the chart's local-day binning. `new Date("2036-04-30")` is UTC
      // midnight, so the old `t <= e` dropped almost the entire end day (and the
      // first hours of the start day in a positive-offset timezone). Upper bound
      // is exclusive at the start of the day AFTER `end`.
      const s = localDayStartMs(time.start, 0);
      const eExcl = localDayStartMs(time.end, 1);
      if (!Number.isFinite(s) || !Number.isFinite(eExcl)) return undatedPasses;
      return t >= s && t < eExcl;
    }
    return false;
  };
}
