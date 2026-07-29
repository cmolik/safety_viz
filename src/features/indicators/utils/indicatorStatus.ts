import type { IndicatorOverviewDataPoint } from "../api/indicators";
import { getChartValue } from "./presentationType";
import { buildPeriodWindow } from "./indicatorWindow";

export type ValueCategory = "unknown" | "safe" | "warning" | "danger";

/**
 * Determines the color category based on value, greenline, and redline
 * Logic:
 * - value <= greenline: safe
 * - greenline < value <= redline: warning
 * - value > redline: danger
 */
export function getValueCategory(
  value: number,
  redline: number | null,
  greenline: number | null = null
): ValueCategory {
  // If both thresholds are defined, use the new three-tier logic
  if (greenline !== null && redline !== null) {
    if (value <= greenline) return "safe";
    if (value <= redline) return "warning";
    return "danger";
  }

  // Fallback to old redline-only logic if greenline is not defined
  if (redline === null) return "safe";

  if (value >= redline) return "danger";

  if (redline > 0) {
    const percentage = (value / redline) * 100;

    if (percentage >= 100) return "danger";
    if (percentage >= 90) return "warning";
  }
  return "safe";
}

/**
 * Gets the worst (most severe) category from a list of categories
 * Returns "unknown" if the list is empty or all categories are unknown
 */
export function getWorstCategory(categories: ValueCategory[]): ValueCategory {
  if (categories.length === 0) return "unknown";
  if (categories.includes("danger")) return "danger";
  if (categories.includes("warning")) return "warning";
  if (categories.includes("safe")) return "safe";
  return "unknown";
}

/**
 * Calculates the status category for an indicator based on its data.
 * Uses the same end-date-anchored 12-month window as the indicator list chart, so it works
 * for experimental indicators whose data lies in the future.
 */
export function getIndicatorStatus(
  data: IndicatorOverviewDataPoint[],
  endDate?: string
): ValueCategory {
  const { slots } = buildPeriodWindow(data, endDate);
  const windowPoints = slots.filter((p): p is IndicatorOverviewDataPoint => p !== null);

  // The status reflects the end-date month (the last slot), matching the bar
  // chart's status box. No value for that month -> "unknown" (gray), not safe.
  const lastPoint = slots[slots.length - 1];
  const lastValue = lastPoint?.value ?? null;
  if (lastValue === null) return "unknown";

  const redlineValue = windowPoints.find(p => p.redline !== null)?.redline ?? null;
  const greenlineValue = windowPoints.find(p => p.greenline !== null)?.greenline ?? null;

  return getValueCategory(getChartValue(lastPoint), redlineValue, greenlineValue);
}

/**
 * Color styles for each category
 */
export const categoryStyles = {
  unknown: { bg: "#e5e7eb", border: "#d1d5db", text: "#6b7280" },
  safe: { bg: "#86efac", border: "#4ade80", text: "#166534" },
  warning: { bg: "#fcd34d", border: "#fbbf24", text: "#78350f" },
  danger: { bg: "#fca5a5", border: "#f87171", text: "#7f1d1d" }
};

/**
 * Very light tint of each category color — used to shade the final (current)
 * month block in the list chart without competing with the solid value box.
 */
export const categoryLightBg = {
  unknown: "#f9fafb", // near-white gray
  safe: "#dcfce7",     // very light green
  warning: "#fef9c3",  // very light yellow
  danger: "#fee2e2"    // very light red
};

/**
 * Bright, saturated status colors for the large current-value number. The dark
 * `categoryStyles.text` tones read too dark at that size, so these use the same
 * vivid hues as the chart's reference lines.
 */
export const categoryValueText = {
  unknown: "#6b7280", // gray
  safe: "#22c55e",     // bright green (matches greenline)
  warning: "#f59e0b",  // bright amber
  danger: "#ef4444"    // bright red (matches redline)
};

/**
 * Tab background colors (same as indicator box colors)
 */
export const tabCategoryColors = {
  unknown: "#d1d5db", // gray - matches indicator box
  safe: "#86efac",     // green - matches indicator box
  warning: "#fcd34d",  // yellow - matches indicator box
  danger: "#fca5a5"    // red - matches indicator box
};
