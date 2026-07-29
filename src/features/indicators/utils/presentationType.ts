import type { IndicatorMetadata, IndicatorOverviewDataPoint } from "../api/indicators";

/**
 * All supported indicator presentation types
 */
export type PresentationType =
  | "timeSeries"
  | "typeCardinality"
  | "numberVsNumber"
  | "timeSinceLastOccurrence"
  | "3dTimeSeries";

/** Decimal places an indicator value is rounded to for display. */
export const VALUE_DECIMALS = 3;

/**
 * Rounds half away from zero at `decimals` places. `toFixed` can't be trusted
 * for this — the binary representation of e.g. 1.0005 sits just below the half,
 * so `(1.0005).toFixed(3)` truncates to "1.000". Shifting through the decimal
 * exponent (rather than multiplying by a power of ten) keeps the mantissa exact,
 * so the half rounds up. Handles exponential-notation values (1e-7) too.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const [mantissa, exponent] = value.toExponential().split("e");
  const shifted = Number(`${mantissa}e${Number(exponent) + decimals}`);
  if (!Number.isFinite(shifted)) return value;
  const rounded = shifted < 0 ? -Math.round(-shifted) : Math.round(shifted);
  const [rMantissa, rExponent] = rounded.toExponential().split("e");
  return Number(`${rMantissa}e${Number(rExponent) - decimals}`);
}

/**
 * Formats an indicator value for display. Overview values may be fractional
 * ratios (e.g. 0.0068) or whole counts: integers render as-is, fractions are
 * rounded (never truncated) to at most 3 decimal places with trailing zeros
 * trimmed (e.g. 0.001, 12.35). null/undefined -> "-".
 */
export function formatIndicatorValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  if (Number.isInteger(value)) return value.toString();
  return roundTo(value, VALUE_DECIMALS).toString();
}

/** How far a rounded label may drift from its true value, as a fraction of it. */
const MAX_RELATIVE_ERROR = 0.05;

/**
 * Picks the fewest decimal places at which a set of related numbers — a bar
 * chart's scale max, its thresholds and its current value — can all be shown
 * without losing what separates them. Two rules decide it:
 *
 * - every label must stay within 5% of its true value, so the rounding step is
 *   small next to the numbers themselves (0.0068 may not print as "0.01");
 * - numbers that differ at full precision must still differ once rounded, so a
 *   value and the threshold above it never render as the same label.
 *
 * A chart of counts therefore labels 12 / 18 / 20, while one of small ratios
 * keeps enough decimals to tell 0.007 from 0.008.
 */
export function pickDecimals(
  values: Array<number | null | undefined>,
  maxDecimals = VALUE_DECIMALS,
): number {
  const numbers = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (numbers.length === 0) return 0;

  const distinctAtFullPrecision = new Set(numbers.map((v) => roundTo(v, maxDecimals))).size;

  for (let decimals = 0; decimals < maxDecimals; decimals++) {
    const rounded = numbers.map((v) => roundTo(v, decimals));
    const tooCoarse = rounded.some(
      (r, i) => Math.abs(r - numbers[i]) > MAX_RELATIVE_ERROR * Math.abs(numbers[i])
    );
    if (tooCoarse) continue;
    if (new Set(rounded).size < distinctAtFullPrecision) continue;
    return decimals;
  }
  return maxDecimals;
}

/** Formats a value at a fixed decimal count (see `pickDecimals`). null -> "-". */
export function formatIndicatorValueAt(
  value: number | null | undefined,
  decimals: number,
): string {
  if (value === null || value === undefined) return "-";
  return roundTo(value, decimals).toFixed(decimals);
}

/**
 * Determines if an indicator should use the standard line-chart visualization.
 * All presentation types currently do.
 */
export function shouldUseLineChartVisualization(indicator: IndicatorMetadata): boolean {
  const validTypes: PresentationType[] = [
    "timeSeries",
    "typeCardinality",
    "numberVsNumber",
    "timeSinceLastOccurrence",
    "3dTimeSeries"
  ];

  return validTypes.includes(indicator.indicatorPresentationType as PresentationType);
}

/**
 * Value used for chart visualization (bars/lines). All presentation types
 * currently share one rendering path; per-type behavior can hook in here if a
 * type ever needs a different source field.
 */
export function getChartValue(
  dataPoint: IndicatorOverviewDataPoint | null | undefined
): number {
  return dataPoint?.value ?? 0;
}

/** Tooltip for a chart data point, with optional threshold annotations. */
export function getChartTooltip(
  dataPoint: IndicatorOverviewDataPoint,
  redline: number | null,
  greenline?: number | null
): string {
  const redlineText = redline !== null ? ` [redline: ${redline}]` : '';
  const greenlineText = greenline !== null && greenline !== undefined ? ` [greenline: ${greenline}]` : '';
  return `${dataPoint.period}: ${formatIndicatorValue(dataPoint.value)}${redlineText}${greenlineText}`;
}

/** Tooltip for the colored display-value box. */
export function getDisplayValueTooltip(
  dataPoint: IndicatorOverviewDataPoint | null | undefined,
  /** Appended when the value is an average rather than the month's own figure. */
  modeNote?: string
): string {
  if (!dataPoint) return "No data available";
  const suffix = modeNote ? ` (${modeNote})` : "";
  return `Last month${suffix}: ${formatIndicatorValue(dataPoint.value)}`;
}
