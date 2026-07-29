import { useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { IndicatorMetadata, IndicatorOverviewDataPoint } from "../api/indicators";
import { useIndicatorsStore } from "../store/indicators.store";
import { buildPeriodWindow } from "../utils/indicatorWindow";
import { getValueCategory, categoryValueText, categoryLightBg } from "../utils/indicatorStatus";
import {
  getChartValue,
  getChartTooltip,
  getDisplayValueTooltip,
  formatIndicatorValueAt,
  pickDecimals
} from "../utils/presentationType";
import { VALUE_MODES } from "../utils/valueMode";
import { MONTH_NAMES, lastDayOfMonth } from "@lib/period";

type IndicatorLineChartProps = {
  indicator: IndicatorMetadata;
  data: IndicatorOverviewDataPoint[];
  /**
   * Optional node rendered at the very start of the chart row (e.g. the
   * expand/collapse chevron in the list). When present it occupies a fixed
   * 20px slot so ID columns stay aligned across rows.
   */
  leadingSlot?: ReactNode;
  /** When set, right-clicking a month block offers "Load this month". */
  onLoadMonth?: (year: number, month: number) => void;
};

// The scale labels sit in a 40px gutter, so they are kept as short as the data
// allows. Ratio indicators can be far below 0.001, though, and a label reading
// "0.000" says less than nothing — hence a deeper cap here than the 3 decimals
// used for values elsewhere.
const MAX_SCALE_DECIMALS = 6;

/**
 * Line-chart visualization for all indicator presentation types: 12 monthly
 * Shows 12 monthly blocks with horizontal lines representing values
 * Supports: timeSeries, typeCardinality, numberVsNumber, timeSinceLastOccurrence, 3dTimeSeries
 */
export default function IndicatorLineChart({ indicator, data, leadingSlot, onLoadMonth }: IndicatorLineChartProps) {
  // The chart shows the 12 months of the selected period — the end-date
  // month is the last (rightmost) slot, going back 11 months. The window is
  // anchored on the selected end date, NOT on "today", so experimental
  // indicators whose data lies in the future (e.g. 2030) still render correctly.
  // Read appliedFilters (the state at the last Apply), not the live filters, so
  // the chart matches the loaded data instead of in-progress filter edits.
  const endDate = useIndicatorsStore((s) => s.appliedFilters.endDate);
  const roundEndDate = useIndicatorsStore((s) => s.appliedFilters.roundEndDate);

  // 12 slots oldest -> newest; slot 11 is the end-date month. Missing months are null.
  const { slots: paddedData, periods, endYear, endMonth } = buildPeriodWindow(data, endDate);

  // The last month is "incomplete" when a specific day before the end of the
  // month is selected and it isn't rounded up to the month end. Its block is
  // drawn only half-width to signal the month's data is partial.
  const endDay = endDate ? Number(endDate.split('-')[2]) : NaN;
  const lastDayOfEndMonth = lastDayOfMonth(endYear, endMonth);
  const isPartialLastMonth = !roundEndDate && !Number.isNaN(endDay) && endDay < lastDayOfEndMonth;

  const windowPoints = paddedData.filter((p): p is IndicatorOverviewDataPoint => p !== null);

  // The status box reflects the end-date month (the last slot). A month with no
  // value yet shows "-" in gray rather than implying a 0 / safe (green) value.
  const lastPoint = paddedData[paddedData.length - 1];
  const lastValue = lastPoint?.value ?? null;

  // Calculate redline/greenline value (first available within the window)
  const redlineValue = windowPoints.find(p => p.redline !== null)?.redline ?? null;

  // Calculate greenline value (first available within the window)
  const greenlineValue = windowPoints.find(p => p.greenline !== null)?.greenline ?? null;

  // Find max value for the scale
  const values = windowPoints
    .map(p => getChartValue(p))
    .filter(v => v > 0);
  const maxValueInData = values.length > 0 ? Math.max(...values) : 0;

  // Determine scale max (use redline, greenline, or data max, whichever is higher)
  const scaleMax = Math.max(
    redlineValue !== null ? redlineValue * 1.2 : 0,
    greenlineValue !== null ? greenlineValue * 1.2 : 0,
    maxValueInData * 1.2
  );

  // Determine box color from the last month's value; no value -> "unknown" (gray).
  const totalCategory = lastValue === null
    ? "unknown"
    : getValueCategory(lastValue, redlineValue, greenlineValue);
  // Bright status color for the large current-value number.
  const valueColor = categoryValueText[totalCategory];

  // One decimal count for every number on the row — the scale max, both
  // thresholds and the current value — chosen as the shortest that still keeps
  // them apart, so the y-axis reads as a proper interval rather than a stack of
  // identically-rounded labels.
  const decimals = pickDecimals(
    [scaleMax, redlineValue, greenlineValue, lastValue],
    MAX_SCALE_DECIMALS
  );
  const valueText = formatIndicatorValueAt(lastValue, decimals);
  // The scale gutter is only 40px wide; a deep-decimal label ("0.000041") needs
  // a smaller type size to fit rather than spilling over the chart blocks.
  const scaleFontSize = decimals >= 5 ? 8 : decimals >= 4 ? 9 : 10;
  // Very light tint for the final (current) month block.
  const lastBlockBg = categoryLightBg[totalCategory];

  // "Last month" is only the truth in Month mode; Float/Fixed show an average.
  const valueMode = useIndicatorsStore((s) => s.valueMode);
  const modeNote = valueMode === "month"
    ? undefined
    : VALUE_MODES.find((m) => m.id === valueMode)?.hint;

  // Left padding for the month-label row so the 12 numbers line up with the
  // 12 blocks. Mirrors the widths (+ 4px flex gaps) of everything to the left
  // of the blocks: [chevron 24][id 80][scale 40], each followed by a 4px gap.
  const leftOffset = (leadingSlot ? 28 : 0) + 128;

  // Title tooltip shown when hovering the indicator id (only once data is loaded).
  // Rendered through a portal at fixed coords so it isn't clipped by the panels'
  // scroll containers nor mis-placed by react-grid-layout's CSS transforms. It is
  // anchored to the chart row's top/bottom so it sits above/below the chart,
  // not over it (below by default, flipped above when near the viewport bottom).
  const hasData = data.length > 0;
  const rowRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(null);

  // Right-click-a-month context menu ("Load this month").
  const [menu, setMenu] = useState<{ x: number; y: number; year: number; month: number } | null>(null);

  const showTip = () => {
    const el = rowRef.current;
    if (!el || !hasData) return;
    const rect = el.getBoundingClientRect();
    const below = rect.bottom < window.innerHeight - 80;
    setTip({
      left: rect.left,
      top: below ? rect.bottom + 16 : rect.top - 6,
      placement: below ? "below" : "above",
    });
  };
  const hideTip = () => setTip(null);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 2
    }}>
      {/* Main chart row */}
      <div ref={rowRef} style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 0",
        minHeight: 40
      }}>
        {/* Expand/collapse chevron slot (list only) */}
        {leadingSlot}

        {/* Indicator ID - Fixed width, left aligned */}
        <div
          onMouseEnter={showTip}
          onMouseLeave={hideTip}
          style={{
            minWidth: 80,
            width: 80,
            fontSize: 13,
            fontWeight: 600,
            color: "#374151",
            flexShrink: 0,
            textAlign: "left",
            cursor: hasData ? "help" : undefined,
          }}
        >
          {indicator.id}
        </div>

        {/* Y-axis scale (max / redline / greenline / 0) — left of the chart */}
        <div style={{
          width: 40,
          height: 40,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "flex-end",
          fontSize: scaleFontSize,
          color: "#6b7280",
          paddingRight: 4,
          flexShrink: 0,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums"
        }}>
          <div style={{ fontWeight: 600 }}>
            {formatIndicatorValueAt(scaleMax, decimals)}
          </div>
          {redlineValue !== null && (
            <div style={{ color: "#ef4444", fontWeight: 600 }}>
              {formatIndicatorValueAt(redlineValue, decimals)}
            </div>
          )}
          {greenlineValue !== null && (
            <div style={{ color: "#22c55e", fontWeight: 600 }}>
              {formatIndicatorValueAt(greenlineValue, decimals)}
            </div>
          )}
          <div>0</div>
        </div>

        {/* 12 Monthly Blocks */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 0,
          height: 40,
          position: "relative"
        }}>
          {paddedData.map((dataPoint, index) => {
            const value = getChartValue(dataPoint);

            const blockRedline = dataPoint?.redline || redlineValue;
            const blockGreenline = dataPoint?.greenline || greenlineValue;

            // Calculate the height of the line as percentage of scale max
            const lineHeight = scaleMax > 0 ? (value / scaleMax) * 100 : 0;

            // The final (current) month is tinted a very light shade of its
            // status color (green / yellow / red); all other months stay white.
            const isLastBlock = index === paddedData.length - 1;
            const blockBgColor = isLastBlock ? lastBlockBg : "white";

            // The incomplete final month is drawn half-width to flag partial data.
            const isPartialBlock = isLastBlock && isPartialLastMonth;
            const lineRight = isPartialBlock ? "50%" : 0;

            const tooltipText = dataPoint
              ? getChartTooltip(dataPoint, blockRedline, blockGreenline)
              : "No data";

            return (
              <div
                key={index}
                style={{
                  border: "1px solid #d1d5db",
                  backgroundColor: blockBgColor,
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: onLoadMonth ? "context-menu" : undefined
                }}
                title={tooltipText}
                onContextMenu={onLoadMonth ? (e) => {
                  e.preventDefault();
                  const [py, pm] = periods[index].split("-").map(Number);
                  setMenu({ x: e.clientX, y: e.clientY, year: py, month: pm });
                } : undefined}
              >
                {/* Horizontal line representing the value */}
                {(
                  <div style={{
                    position: "absolute",
                    left: 0,
                    right: lineRight,
                    height: 2,
                    backgroundColor: "#3b82f6",
                    top: `${100 - lineHeight}%`,
                    transform: "translateY(-50%)"
                  }} />
                )}

                {/* Red line representing the redline threshold */}
                {blockRedline !== null && scaleMax > 0 && (
                  <div style={{
                    position: "absolute",
                    left: 0,
                    right: lineRight,
                    height: 2,
                    backgroundColor: "#ef4444",
                    top: `${100 - ((blockRedline / scaleMax) * 100)}%`,
                    transform: "translateY(-50%)",
                    opacity: 0.8
                  }} />
                )}

                {/* Green line representing the greenline threshold */}
                {blockGreenline !== null && scaleMax > 0 && (
                  <div style={{
                    position: "absolute",
                    left: 0,
                    right: lineRight,
                    height: 2,
                    backgroundColor: "#22c55e",
                    top: `${100 - ((blockGreenline / scaleMax) * 100)}%`,
                    transform: "translateY(-50%)",
                    opacity: 0.8
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Current value — number only, status-colored, left-aligned */}
        <div style={{
          width: 72,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: 4,
          fontSize: 24,
          fontWeight: 700,
          color: valueColor,
          flexShrink: 0,
          whiteSpace: "nowrap"
        }}
          title={getDisplayValueTooltip(lastPoint, modeNote)}
        >
          {valueText}
        </div>
      </div>

      {/* Month labels — shown for every row, selected or not */}
      <div style={{
        display: "flex",
        gap: 4,
        paddingLeft: leftOffset, // Align with the 12 blocks (chevron + ID + scale)
      }}>
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 0,
          fontSize: 10,
          color: "#6b7280",
          textAlign: "center"
        }}>
          {Array.from({ length: 12 }, (_, i) => {
            // Calculate the actual month number for this position
            // Position 0 is 11 months before end month, position 11 is the end month
            const monthNumber = ((endMonth - 11 + i) % 12 + 12) % 12 || 12;
            return <div key={i}>{monthNumber}</div>;
          })}
        </div>
        {/* Spacer matching the value column on the right */}
        <div style={{ width: 72 }} />
      </div>

      {/* Indicator-title tooltip (portal -> body, fixed coords, above/below the row) */}
      {tip && createPortal(
        <div style={{
          position: "fixed",
          left: tip.left,
          top: tip.top,
          transform: tip.placement === "above" ? "translateY(-100%)" : undefined,
          zIndex: 2000,
          maxWidth: 410,
          padding: "6px 10px",
          backgroundColor: "#1f2937",
          color: "white",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
          pointerEvents: "none",
        }}>
          {indicator.title}
        </div>,
        document.body
      )}

      {/* Right-click "Load this month" menu (portal -> body). A full-screen
          backdrop closes it on any outside click / right-click. */}
      {menu && onLoadMonth && createPortal(
        <>
          <div
            onClick={() => setMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 3000 }}
          />
          <div style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            zIndex: 3001,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
            padding: 4,
            minWidth: 170,
          }}>
            <button
              type="button"
              onClick={() => { onLoadMonth(menu.year, menu.month); setMenu(null); }}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderRadius: 4,
                padding: "8px 10px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f3f4f6"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>Load this month</span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>{MONTH_NAMES[menu.month - 1]} {menu.year}</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
