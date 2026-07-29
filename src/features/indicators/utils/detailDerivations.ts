// Pure derivations behind DetailPanel's chart view. Each function is the body
// of what used to be an inline useMemo — the component keeps the memos and
// calls these, so the data flow is testable without React.

import type { IndicatorOverviewDataPoint } from "../api/indicators";
import type { DailyData, MonthStats } from "../types/dataTypes";
import type { PeriodWindow } from "./indicatorWindow";
import { applyValueMode, type ValueMode } from "./valueMode";
import { normalizePeriod, parsePeriod, lastDayOfMonth } from "@lib/period";

/** The applied end date's (year, month), the ceiling every period must respect. */
export type EndCeiling = { year: number; month: number };

export function parseEndCeiling(endDate: string | undefined): EndCeiling | null {
  if (!endDate) return null;
  const [y, m] = endDate.split('-').map(Number);
  return { year: y, month: m };
}

/** True when the applied end date is a specific day before month end and isn't
 *  rounded up — the final month's column is then drawn half-width. */
export function isPartialEndMonth(endDate: string | undefined, roundEndDate: boolean): boolean {
  if (!endDate || roundEndDate) return false;
  const [y, m, d] = endDate.split('-').map(Number);
  if (Number.isNaN(d)) return false;
  return d < lastDayOfMonth(y, m);
}

/** Whether a "YYYY-M" period is at or before the ceiling (no ceiling = always). */
export function isWithinEnd(period: string, ceiling: EndCeiling | null): boolean {
  if (!ceiling) return true;
  const { year, month } = parsePeriod(period);
  return year < ceiling.year || (year === ceiling.year && month <= ceiling.month);
}

/**
 * The chart history: the multi-year history with the loaded 12-month window
 * overlaid on top as the authoritative copy of the months it covers. The
 * overlay matters because the history fetch can omit the current edge month,
 * which would leave that month's year-over-year subgraph short its newest year
 * (e.g. showing 2042–2045 instead of 2043–2046) while the value line above
 * still plots it. Mirrors applyValueMode's data-over-history overlay. The mode
 * is applied to the merged series so each of its months averages over the
 * months before it — the same footing as the value line.
 */
export function buildChartHistory(
  history: IndicatorOverviewDataPoint[] | null,
  loadedWindow: IndicatorOverviewDataPoint[] | null,
  valueMode: ValueMode,
): IndicatorOverviewDataPoint[] | null {
  if (!history && !loadedWindow) return null;
  const byPeriod = new Map<string, IndicatorOverviewDataPoint>();
  for (const p of history ?? []) byPeriod.set(normalizePeriod(p.period), p);
  for (const p of loadedWindow ?? []) byPeriod.set(normalizePeriod(p.period), p);
  const merged = [...byPeriod.values()];
  return applyValueMode(merged, merged, valueMode);
}

/** After the end ceiling, keep only the most recent `historyYears` years per
 *  month so every month's sub-graph shows the same count of years. */
export function capHistoryYears(
  chartHistory: IndicatorOverviewDataPoint[],
  ceiling: EndCeiling | null,
  historyYears: number,
): IndicatorOverviewDataPoint[] {
  const withinEnd = chartHistory.filter(p => isWithinEnd(p.period, ceiling));
  const byYearDesc = [...withinEnd].sort((a, b) =>
    parsePeriod(b.period).year - parsePeriod(a.period).year
  );
  const countByMonth = new Map<number, number>();
  return byYearDesc.filter(p => {
    const { month } = parsePeriod(p.period);
    const n = countByMonth.get(month) ?? 0;
    if (n >= historyYears) return false;
    countByMonth.set(month, n + 1);
    return true;
  });
}

/** The window's periods as chart rows; look-ahead columns carry no value. */
export function buildChartData(periodWindow: PeriodWindow): DailyData[] {
  return periodWindow.periods.map((period, i) => ({
    date: period,
    count: periodWindow.slots[i]?.value ?? 0,
  }));
}

/** Raw (mode-independent) monthly points keyed by normalized "YYYY-M". */
export function buildRawByPeriod(
  raw: IndicatorOverviewDataPoint[] | null,
): Map<string, IndicatorOverviewDataPoint> {
  const map = new Map<string, IndicatorOverviewDataPoint>();
  for (const p of raw ?? []) map.set(normalizePeriod(p.period), p);
  return map;
}

/** One column of the transposed (month-as-column) table under the chart. */
export type TransposedColumn = {
  monthNum: number;
  days: number;                    // drives the grid's fractional column width
  value: number | null;            // the ratio the chart plots
  monthlyFindings: number | null;  // this month's findings (ratio numerator)
  monthlyMovements: number | null; // this month's movements (ratio denominator)
  sumFindings: number | null;      // window sum in Float/Fixed; = monthly in Month
  sumMovements: number | null;
  redline: number | null;
  greenline: number | null;
};

/**
 * Transposed view of the data, aligned with the chart. Each column carries its
 * calendar month number and its length in days — the day counts drive the
 * grid's fractional column widths so they match the chart's time scale (months
 * are not equal width). `value` is the ratio the chart plots; `monthly*` are
 * the single month's ratio inputs and `sum*` are the window totals that make
 * the Float/Fixed average (equal to monthly in Month).
 */
export function buildTransposed(
  periodWindow: PeriodWindow,
  rawByPeriod: Map<string, IndicatorOverviewDataPoint>,
): TransposedColumn[] {
  return periodWindow.periods.map((period, i) => {
    const { year: y, month: m } = parsePeriod(period);
    const slot = periodWindow.slots[i];
    const raw = rawByPeriod.get(`${y}-${m}`);
    return {
      monthNum: m,
      days: lastDayOfMonth(y, m),
      value: slot?.value ?? null,
      monthlyFindings: raw?.findings ?? null,
      monthlyMovements: raw?.movements ?? null,
      sumFindings: slot?.findings ?? null,
      sumMovements: slot?.movements ?? null,
      redline: slot?.redline ?? null,
      greenline: slot?.greenline ?? null,
    };
  });
}

export type SubGraphMonth = {
  month: string; // month number label (1–12), in line with the indicator list chart
  historicalData: Array<{ year: string; count: number }>;
};

/** Subgraph data for every column (incl. look-ahead), grouped by calendar month. */
export function buildAllMonthsData(
  periodWindow: PeriodWindow,
  historicalData: IndicatorOverviewDataPoint[] | null,
): SubGraphMonth[] {
  const hist = historicalData ?? [];
  const hasHistory = hist.length > 0;

  const byMonth: Record<number, Array<{ year: string; count: number }>> = {};
  for (const point of hist) {
    const [year, monthNum] = point.period.split('-');
    const month = parseInt(monthNum, 10);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push({ year, count: point.value ?? 0 });
  }

  return periodWindow.periods.map((period, i) => {
    const [year, monthNum] = period.split('-');
    const month = parseInt(monthNum, 10);
    const monthLabel = String(month);
    if (hasHistory) {
      const monthData = (byMonth[month] || []).slice().sort((a, b) => parseInt(a.year) - parseInt(b.year));
      return { month: monthLabel, historicalData: monthData };
    }
    // Fallback when no history: show the column's own value as a single dot.
    const slot = periodWindow.slots[i];
    return { month: monthLabel, historicalData: slot ? [{ year, count: slot.value ?? 0 }] : [] };
  });
}

/** Month stats for the chart's historical band, keyed as "YYYY-M" -> { count }. */
export function buildMonthStats(historicalData: IndicatorOverviewDataPoint[] | null): MonthStats {
  if (!historicalData || historicalData.length === 0) return {};
  const stats: MonthStats = {};
  for (const point of historicalData) {
    stats[point.period] = { count: point.value ?? 0 };
  }
  return stats;
}
