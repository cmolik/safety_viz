import type { IndicatorOverviewDataPoint } from "../api/indicators";
// Relative import (not @lib) so the node-run verify:calc script can resolve it.
import { addMonths, formatPeriod, normalizePeriod, isoMonthStart, isoMonthEnd } from "../../../lib/period.ts";

export type PeriodWindow = {
  /** 12 month-slots, oldest -> newest. With lookAhead = 0 slot 11 is the end-date
   *  month; with lookAhead = N the end-date month is slot (11 - N) and the last N
   *  slots are future months. Missing months are null. */
  slots: (IndicatorOverviewDataPoint | null)[];
  /** "YYYY-M" period string for each slot, aligned with `slots`. */
  periods: string[];
  endYear: number;
  endMonth: number; // 1-based
  /** Slots at or before the end-date month (= 12 - lookAhead); the rest are look-ahead. */
  actualCount: number;
};

/**
 * Builds the 12-month display window for an indicator's overview data, anchored
 * on the selected end date (NOT on "today"). With `lookAhead = 0` the end-date
 * month is the last (rightmost) slot and the window goes back 11 months. With
 * `lookAhead = N` (0–11) the window shifts forward: the end-date month moves to
 * slot (11 - N), the oldest N months drop off, and N future months are appended
 * on the right. Falls back to the latest data point, then the current month, when
 * no end date is given. API periods are "YYYY-M" (month not zero-padded).
 */
export function buildPeriodWindow(
  data: IndicatorOverviewDataPoint[],
  endDate: string | undefined,
  lookAhead = 0,
): PeriodWindow {
  const dataByPeriod = new Map<string, IndicatorOverviewDataPoint>();
  for (const point of data) {
    dataByPeriod.set(normalizePeriod(point.period), point);
  }

  const endParts = endDate
    ? endDate.split('-').map(Number)
    : data.length > 0
      ? data[data.length - 1].period.split('-').map(Number)
      : [new Date().getFullYear(), new Date().getMonth() + 1];
  const endYear = endParts[0];
  const endMonth = endParts[1];

  const slots: (IndicatorOverviewDataPoint | null)[] = [];
  const periods: string[] = [];
  for (let i = 0; i < 12; i++) {
    // i = 11 - lookAhead -> end month; shifting i by +lookAhead moves the window forward.
    const { year, month } = addMonths(endYear, endMonth, -11 + lookAhead + i);
    const key = formatPeriod(year, month);
    periods.push(key);
    slots.push(dataByPeriod.get(key) ?? null);
  }

  return { slots, periods, endYear, endMonth, actualCount: 12 - lookAhead };
}

/** Cache key for the detail chart's look-ahead history (one entry at a time). */
export function detailHistoryKey(
  uri: string, lookAhead: number, historyYears: number, endDate: string, roundEndDate: boolean,
): string {
  return `${uri}::la${lookAhead}::hy${historyYears}::${endDate}::${roundEndDate}`;
}

/** End date extended forward by `months`, snapped to that month's last day, so
 *  the overview response covers the look-ahead months. */
export function extendEndDateByMonths(endDate: string, months: number): string {
  const [y, m] = endDate.split('-').map(Number);
  const shifted = addMonths(y, m, months);
  return isoMonthEnd(shifted.year, shifted.month);
}

/** Start date ("YYYY-MM-01") of the 12-month overview window ending at `endDate`:
 *  the first day of the month 11 months back (e.g. 2025-05-18 -> 2024-06-01). */
export function overviewStartDate(endDate: string): string {
  const [y, m] = endDate.split('-').map(Number);
  const start = addMonths(y, m, -11);
  return isoMonthStart(start.year, start.month);
}

/** Start date of the multi-year history fetch: `historyYears` back from the end
 *  date so each month's sub-graph shows that many years, plus one extra year of
 *  look-back the Float/Fixed value modes need to compute the OLDEST displayed
 *  point — Float averages the 11 months before a point and Fixed reaches back to
 *  January of the point's year, both of which fall before the `historyYears`
 *  boundary. Without the buffer those oldest points render "-". The extra year
 *  is look-back only; the display still caps at `historyYears` per month. */
export function historicalStartDate(endDate: string, historyYears: number): string {
  const [y, m] = endDate.split('-').map(Number);
  return isoMonthStart(y - historyYears - 1, m);
}
