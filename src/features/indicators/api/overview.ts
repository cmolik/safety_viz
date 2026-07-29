import { ApiClient } from "@core/api/http";
import type { IndicatorVariables } from "./metadata.ts";

/**
 * Data point from /root-dashboard/indicators/overview endpoint.
 * `value` is the period's main value (null for future periods) and equals
 * `findings / movements * unit`. The overview reports each variable's per-period
 * value under its own varRole name (e.g. `inspections`, `occurrences`,
 * `constant`), which differs per indicator; `fetchIndicatorOverview` resolves
 * them onto these three canonical fields using the indicator's `varRoles`:
 * - `findings`   — the numerator variable (absolute_value)
 * - `movements`  — the denominator variable (related_to_value, non-constant)
 * - `unit`       — the normalization constant, if the formula has one
 * Any is null when the indicator's formula doesn't include that role.
 */
export type IndicatorOverviewDataPoint = {
  uri: string | null;
  period: string;              // e.g., "2025-2", "2025-3"
  periodType: string | null;   // e.g., "month"; null for not-yet-computed periods
  value: number | null;        // Main value for the period (ratio or count)
  findings: number | null;     // ratio numerator (varRole absolute_value)
  movements: number | null;    // ratio denominator (varRole related_to_value)
  unit: number | null;         // ratio multiplier / constant (varRole "constant", e.g. 10000)
  redline: number | null;
  greenline: number | null;
};

/**
 * Query parameters for the indicator overview endpoint
 */
export type IndicatorOverviewQueryParams = {
  uri: string;              // Indicator URI (required)
  startDate?: string;       // Format "yyyy-MM-dd"
  endDate?: string;         // Format "yyyy-MM-dd"
  roundEndDate?: boolean;   // If true, endDate is rounded to the last day of its month
  // The indicator's formula variables (from its varRoles). Used to read each
  // per-period value from its real column name; omit to fall back to the generic
  // findings / movements / unit names an older backend used.
  variables?: IndicatorVariables;
};

/** Reads a finite number from the first matching key (tolerates casing/name
 *  changes and numeric strings). Falsy keys are skipped so optional variable
 *  names can be passed through directly. */
function pickNumber(obj: Record<string, unknown>, ...keys: Array<string | null | undefined>): number | null {
  for (const key of keys) {
    if (!key) continue;
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Fetches overview data for a specific indicator from /root-dashboard/indicators/overview
 */
export async function fetchIndicatorOverview(
  api: ApiClient,
  params: IndicatorOverviewQueryParams,
  signal?: AbortSignal
): Promise<IndicatorOverviewDataPoint[]> {
  const { uri, startDate, endDate, roundEndDate, variables } = params;

  // Build query string
  const queryParams = new URLSearchParams();
  queryParams.append('uri', uri);
  if (startDate) queryParams.append('startDate', startDate);
  if (endDate) queryParams.append('endDate', endDate);
  if (roundEndDate !== undefined) queryParams.append('roundEndDate', String(roundEndDate));

  const url = `root-dashboard/indicators/overview?${queryParams.toString()}`;

  const data = await api.get<IndicatorOverviewDataPoint[]>(url, signal ? { signal } : undefined);

  // Resolve each variable onto the canonical findings / movements / unit fields.
  // The endpoint names the columns after the indicator's varRoles (e.g.
  // `inspections`, `occurrences`, `constant`), so try those first; the generic
  // names (and capitalized variants) are kept as a fallback for older backends.
  for (const p of data as unknown as Record<string, unknown>[]) {
    p.findings = pickNumber(p, variables?.numerator, "findings", "Findings");
    p.movements = pickNumber(p, variables?.denominator, "movements", "Movements");
    p.unit = pickNumber(p, variables?.constant, "unit", "Unit");
  }

  return data;
}
