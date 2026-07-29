import type { IndicatorOverviewDataPoint } from "../api/indicators";
// Relative import (not @lib) so the node-run verify:calc script can resolve it.
import { addMonths, formatPeriod, normalizePeriod, parsePeriod } from "../../../lib/period.ts";

/**
 * How a displayed month's value is derived from the raw monthly data:
 * - "month" — the month's own value, exactly as the endpoint returns it
 * - "float" — rolling average over the month and the 11 months before it
 * - "fixed" — year-to-date average, from January of that month's year
 */
export type ValueMode = "month" | "float" | "fixed";

export const VALUE_MODES: { id: ValueMode; label: string; hint: string }[] = [
  { id: "month", label: "Month", hint: "Each month's own value." },
  { id: "float", label: "Float", hint: "Average over the month and the 11 months before it." },
  { id: "fixed", label: "Fixed", hint: "Average from January of that month's year up to the month." },
];

/**
 * The source months feeding one displayed month, oldest -> newest.
 * float: the 12 months ending at `period`; fixed: January of its year .. `period`.
 */
export function sourcePeriods(period: string, mode: ValueMode): string[] {
  const { year, month } = parsePeriod(period);
  if (mode === "month") return [formatPeriod(year, month)];
  const back = mode === "fixed" ? month - 1 : 11;
  const periods: string[] = [];
  for (let i = back; i >= 0; i--) {
    const shifted = addMonths(year, month, -i);
    periods.push(formatPeriod(shifted.year, shifted.month));
  }
  return periods;
}

type Aggregate = Pick<IndicatorOverviewDataPoint, "value" | "findings" | "movements" | "unit">;

const NO_AGGREGATE: Aggregate = { value: null, findings: null, movements: null, unit: null };

/**
 * Averages a window of months as the ratio of their summed inputs —
 * `sum(findings) / sum(movements) * unit` — which is how the indicator itself is
 * defined. Averaging the monthly ratios instead would weight a quiet month the
 * same as a busy one, so the sums are what get divided.
 *
 * The window has to be complete: a 12-month average built from the 7 months that
 * happen to be loaded is not a 12-month average, and quietly showing one would
 * read as a real drop. Anything short — a month the history prefetch hasn't
 * reached, or an indicator that reports no `movements` at all — yields null, and
 * the UI renders "-".
 *
 * `unit` is the ratio's normalization constant (per indicator, not per month),
 * so the newest one in the window wins; it defaults to 1 when the endpoint
 * omits it.
 */
function aggregate(window: IndicatorOverviewDataPoint[], expectedMonths: number): Aggregate {
  let findings = 0;
  let movements = 0;
  let unit: number | null = null;
  let used = 0;

  for (const point of window) {
    if (point.findings == null || point.movements == null) continue;
    findings += point.findings;
    movements += point.movements;
    if (point.unit != null) unit = point.unit;
    used++;
  }

  if (used < expectedMonths || movements <= 0) return NO_AGGREGATE;
  const normalization = unit ?? 1;
  return { value: (findings / movements) * normalization, findings, movements, unit: normalization };
}

/**
 * Re-derives every point's value under the given mode. `history` supplies the
 * look-back months Float/Fixed need before the start of the loaded window — the
 * store warms ~5 years per indicator in the background, so right after a load
 * the earliest months may still read "-" until the prefetch reaches them.
 *
 * "month" is the identity, so the raw array is returned untouched. Months with
 * no value of their own stay empty rather than being back-filled by their window.
 */
export function applyValueMode(
  data: IndicatorOverviewDataPoint[],
  history: IndicatorOverviewDataPoint[] | undefined,
  mode: ValueMode,
): IndicatorOverviewDataPoint[] {
  if (mode === "month") return data;

  const byPeriod = new Map<string, IndicatorOverviewDataPoint>();
  for (const point of history ?? []) byPeriod.set(normalizePeriod(point.period), point);
  // The loaded window is the authoritative copy of the months it covers.
  for (const point of data) byPeriod.set(normalizePeriod(point.period), point);

  return data.map((point) => {
    if (point.value == null) return point; // no data for this month — nothing to average into
    const periods = sourcePeriods(point.period, mode);
    const window = periods
      .map((key) => byPeriod.get(key))
      .filter((p): p is IndicatorOverviewDataPoint => p != null);
    return { ...point, ...aggregate(window, periods.length) };
  });
}
