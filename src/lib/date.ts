//src/lib/date.ts

/** two digit number (01..12) */
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Returns a new Date trimmed to local midnight (no time). */
export function atLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "YYYY-MM-DD" for local date - without UTC shifts. */
export function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parses "dd.mm.yyyy" to Date (strictly, without time shifts). */
export function parseCZ(input: string): Date | null {
  const m = input.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3]);
  const dt = new Date(y, mo, d);
  return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d ? dt : null;
}

/**
 * Formats to "dd.mm.yyyy"
 * Accepts ISO "YYYY-MM-DD", Date, or milliseconds.
 */
export function formatCZ(input?: string | Date | number): string {
  if (input == null) return "";
  if (typeof input === "string") {
    // ISO?
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, y, mm, dd] = m;
      return `${dd}.${mm}.${y}`;
    }
    // string -> Date?
    const dt = new Date(input);
    if (isNaN(dt.getTime())) return "";
    return formatCZ(toIsoLocal(atLocalMidnight(dt)));
  }
  const dt = typeof input === "number" ? new Date(input) : input;
  if (isNaN(dt.getTime())) return "";
  const iso = toIsoLocal(atLocalMidnight(dt));
  const [, y, mm, dd] = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
  return `${dd}.${mm}.${y}`;
}

/**
 * Returns ISO "YYYY-MM-DD".
 * - Date -> local ISO
 * - "dd.mm.yyyy" -> ISO
 * - ISO unchanged
 * - invalid ⇒ undefined
 */
export function formatISO(input?: string | Date | number): string | undefined {
  if (input == null) return undefined;
  if (input instanceof Date) return toIsoLocal(atLocalMidnight(input));
  if (typeof input === "number") return toIsoLocal(atLocalMidnight(new Date(input)));
  if (typeof input === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const cz = parseCZ(input);
    if (cz) return toIsoLocal(cz);
    const dt = new Date(input);
    if (!isNaN(dt.getTime())) return toIsoLocal(atLocalMidnight(dt));
  }
  return undefined;
}

/** Range of the last N days (including today) as ISO; keep `nowMs` stable in `useMemo`. */
export function lastNDaysRangeISO(days: number, nowMs = Date.now()): { startISO: string; endISO: string } {
  const end = atLocalMidnight(new Date(nowMs));
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { startISO: toIsoLocal(start), endISO: toIsoLocal(end) };
}

/** today (hours trimmed) */
export function today(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/** Validates if a string matches yyyy-mm-dd format and represents a valid date */
export function isValidDateFormat(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  // Also check if it's a valid date
  const date = new Date(dateStr);
  return date.toISOString().startsWith(dateStr);
}