// src/lib/period.ts
//
// Utilities for month periods in the API's "YYYY-M" key format (month 1-based,
// NOT zero-padded — e.g. "2025-3"). Data points and comment keys use this form;
// date strings ("YYYY-MM-DD") are handled in ./date.ts instead.

/** A calendar month; `month` is 1-based (1 = January). */
export type YearMonth = { year: number; month: number };

/** Parses "YYYY-M" (or zero-padded "YYYY-MM") into numbers. */
export function parsePeriod(period: string): YearMonth {
  const [year, month] = period.split("-").map(Number);
  return { year, month };
}

/** Formats a year + 1-based month as the API's "YYYY-M" period key. */
export function formatPeriod(year: number, month: number): string {
  return `${year}-${month}`;
}

/** Normalizes a period string to the canonical "YYYY-M" form ("2025-03" -> "2025-3"). */
export function normalizePeriod(period: string): string {
  const { year, month } = parsePeriod(period);
  return formatPeriod(year, month);
}

/** Shifts a month by `delta` months (may be negative), normalizing year overflow. */
export function addMonths(year: number, month: number, delta: number): YearMonth {
  let m = month + delta;
  let y = year;
  while (m <= 0) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return { year: y, month: m };
}

/** Chronological comparison of two periods; negative when `a` is earlier. */
export function comparePeriods(a: YearMonth, b: YearMonth): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month;
}

/** Number of days in the given month (1-based). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Two-digit zero padding (3 -> "03"). */
export const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** ISO "YYYY-MM-DD" of the first day of the given month. */
export function isoMonthStart(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

/** ISO "YYYY-MM-DD" of the last day of the given month. */
export function isoMonthEnd(year: number, month: number): string {
  return `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`;
}

/** English month abbreviations, index 0 = Jan. */
export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Full English month names, index 0 = January. */
export const MONTH_NAMES_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
