import React from 'react';
import { ParentSize } from '@visx/responsive';
import { max } from 'd3-array';
import type { DailyData, DayStats, MonthStats, WeekStats } from '../../types/dataTypes';
import {
  computeAggregatedMonthStats,
  computeAggregatedMonthStatsExcluding,
  calculateHistoricalMinMax,
  createScales,
  generateAreaPath,
  parseDateForGranularity
} from '../../utils/chartUtils';
import {
  ChartGrid,
  HistoricalArea,
  HistoricalAvgLine,
  RedlineLine,
  GreenlineLine,
  CurrentYearLines,
  ChartLegend,
  ChartAxes
} from './ChartComponents';
import SubGraph from './SubGraph';
import CommentMarkers, { COMMENT_ICON_CLEARANCE } from './CommentMarkers';
import CommentFillDefs from './CommentFills';
import type { IndicatorComment } from '../../api/comments';
import { commentPeriodKey } from '../../api/comments';

interface ExperimentalChartProps {
    filteredData: DailyData[]; // Current period data
    allData: DailyData[]; // Full dataset for historical data
    granulation: 'day' | 'week' | 'month'; // Current granulation setting
    currentStartDate: string; // Current period start date (e.g., "2024-01-01")
    margin: { top: number; right: number; bottom: number; left: number };
    dayStats: DayStats;
    monthStats: MonthStats;
    weekStats: WeekStats;
    showSubgraphs: boolean;
    allMonthsData: Array<{ month: string; historicalData: Array<{ year: string; count: number }> }>;
    redlineValues: (number | null)[];
    greenlineValues: (number | null)[];
    isPartialLastMonth?: boolean; // draw the last month's content half-width when true
    // Number of leading columns that hold actual (<= selected date) data. The
    // value line and threshold lines are drawn only for these; the remaining
    // columns are look-ahead months that show their historical sub-graphs only.
    // Defaults to all columns (no look-ahead).
    actualCount?: number;
    // Period ("YYYY-M", month not zero-padded) -> the selected indicator's
    // comments for that month. Subgraph dots for these periods are highlighted
    // and show the comments in a tooltip.
    comments?: Map<string, IndicatorComment[]>;
    // Opens the comment editor for a period. Fired by the note icons and by
    // right-clicking a month column (the only way into a month with none yet).
    onOpenComments?: (periodKey: string, clientX: number, clientY: number) => void;
}


const ExperimentalChart: React.FC<ExperimentalChartProps> = ({
      filteredData,
      granulation,
      margin,
      dayStats,
      monthStats,
      weekStats,
      showSubgraphs,
      allMonthsData,
      redlineValues,
      greenlineValues,
      isPartialLastMonth = false,
      actualCount,
      comments,
      onOpenComments,
    }) => {
      // Get current year for filtering
      const currentYear = new Date().getFullYear();

      // Accessors
      const getCount = (d: DailyData) => d.count;

  return (
    <ParentSize>
      {({ width: containerWidth = 800 }) => {
        const width = containerWidth;
        const height = 600;
        const xMax = width - margin.left - margin.right;
        const yMax = height - margin.top - margin.bottom;

        // Look-ahead split: the value line + threshold lines cover only the leading
        // `actCount` (actual, <= selected date) columns. Axis ticks, the historical
        // band, and the sub-graphs still span the full set of columns.
        const actCount = Math.max(0, Math.min(actualCount ?? filteredData.length, filteredData.length));
        const actualData = filteredData.slice(0, actCount);

        // Compute aggregated month stats for historical min/max (includes all historical data for Y scale)
        const aggregatedMonthStats = computeAggregatedMonthStats(monthStats, currentYear);

        // Calculate historical min/max lines (used for Y scale)
        const historicalMinMax = calculateHistoricalMinMax(filteredData, granulation, dayStats, weekStats, aggregatedMonthStats);

        // Calculate the y-axis domain to include both current data and historical max/min
        // (look-ahead columns carry no value, so scale to the actual data only).
        const currentMax = max(actualData, getCount) || 0;
        const historicalMax = historicalMinMax.length > 0 ? (max(historicalMinMax, (h: { date: string; min: number; max: number }) => h.max) || 0) : 0;

        // Include redline/greenline in the Y domain (the chart scales to the max
        // of historical span, thresholds and value, plus headroom).
        const thresholdMax = Math.max(
          0,
          ...redlineValues.filter((v): v is number => v != null),
          ...greenlineValues.filter((v): v is number => v != null),
        );

        // Create scales (Y scale unchanged - based on full historical data)
        const { xScale, yScale } = createScales(filteredData, xMax, yMax, granulation, currentMax, historicalMax, thresholdMax);

        // X where the actual region ends: the start of the first look-ahead column,
        // or the chart's right edge when there's no look-ahead. Value/threshold
        // lines extend their last actual segment to here instead of to xMax.
        const boundaryX = actCount < filteredData.length
          ? xScale(parseDateForGranularity(filteredData[actCount].date, granulation))
          : xMax;

        // Separate historical min/max for area path only (excludes current period values)
        const currentPeriods = new Set(filteredData.map(d => d.date));
        const aggregatedMonthStatsExclCurrent = computeAggregatedMonthStatsExcluding(monthStats, currentPeriods);
        const historicalMinMaxForArea = calculateHistoricalMinMax(filteredData, granulation, dayStats, weekStats, aggregatedMonthStatsExclCurrent);
        const areaPath = generateAreaPath(historicalMinMaxForArea, xScale, yScale, granulation);

        const subgraphHeight = showSubgraphs && granulation === 'month' ? 80 : 0;
        const totalHeight = height + subgraphHeight;

        // Calculate global max for subgraphs
        const globalMax = showSubgraphs && granulation === 'month' && allMonthsData.length > 0
          ? Math.max(...allMonthsData.flatMap(m => m.historicalData.map(h => h.count)), 0) || 100
          : 100;

        // Column geometry, shared by the note icons and the right-click targets:
        // each column spans from its own tick to the next one (the last runs to
        // the chart's right edge), the same way the sub-graphs are laid out.
        const columns = granulation === 'month'
          ? filteredData.map((d, i) => {
              const startX = xScale(parseDateForGranularity(d.date, granulation));
              const endX = i < filteredData.length - 1
                ? xScale(parseDateForGranularity(filteredData[i + 1].date, granulation))
                : xMax;
              // A note icon hangs just above its month's value on the step line.
              // Look-ahead columns carry no value (their count is a placeholder
              // 0, which would drop the icon to the axis), so those sit at the
              // top of the plot instead; every icon is clamped to stay inside it.
              const valueY = i < actCount ? yScale(getCount(d)) : COMMENT_ICON_CLEARANCE;
              return {
                periodKey: commentPeriodKey(d.date) ?? d.date,
                startX,
                width: endX - startX,
                centerX: startX + (endX - startX) / 2,
                iconY: Math.max(COMMENT_ICON_CLEARANCE, valueY - 6),
              };
            })
          : [];


        return (
          <svg width={width} height={totalHeight}>
            {/* Banded fills for months holding more than one comment type;
                referenced by both the note icons and the sub-graph dots. */}
            {comments && <CommentFillDefs comments={comments} />}
            <g transform={`translate(${margin.left}, ${margin.top})`}>
              <ChartGrid granularity={granulation} xScale={xScale} yMax={yMax} />
              <HistoricalArea areaPath={areaPath} />
              {/* Per-month average line, drawn over the min/max band. */}
              <HistoricalAvgLine historicalMinMax={historicalMinMaxForArea} xScale={xScale} yScale={yScale} granularity={granulation} />
              {/* Redline/greenline are the indicator's constant thresholds: drawn
                  across every column (incl. look-ahead) at full width. The partial
                  last-month half-width only applies with no look-ahead, where the
                  final column is the (possibly partial) selected month. */}
              <RedlineLine filteredData={filteredData} redlineValues={redlineValues} xScale={xScale} yScale={yScale} xMax={xMax} granularity={granulation} partialLastColumn={actCount < filteredData.length ? false : isPartialLastMonth} />
              <GreenlineLine filteredData={filteredData} greenlineValues={greenlineValues} xScale={xScale} yScale={yScale} xMax={xMax} granularity={granulation} partialLastColumn={actCount < filteredData.length ? false : isPartialLastMonth} />
              {/* The value line stops at the selected date (actual columns only). */}
              <CurrentYearLines filteredData={actualData} xScale={xScale} yScale={yScale} xMax={boundaryX} granularity={granulation} partialLastColumn={isPartialLastMonth} />
              <ChartLegend/>
              <ChartAxes xScale={xScale} yScale={yScale} yMax={yMax} filteredData={filteredData} granularity={granulation} />

              {/* Divider between actual months and the look-ahead (history-only) columns */}
              {actCount < filteredData.length && (
                <line x1={boundaryX} y1={0} x2={boundaryX} y2={yMax} stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4,4" opacity={0.7} />
              )}

              {/* Right-click targets over the plot: transparent, one per month,
                  so a month with no note icon can still be commented on. */}
              {onOpenComments && columns.map(({ periodKey, startX, width }) => (
                <rect
                  key={`comment-hit-${periodKey}`}
                  x={startX}
                  y={0}
                  width={width}
                  height={yMax}
                  fill="transparent"
                  style={{ cursor: "context-menu" }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenComments(periodKey, e.clientX, e.clientY);
                  }}
                />
              ))}

              {/* Note icons, above each month's value on the current-year line.
                  Drawn last so they sit over the band and the value line. */}
              {comments && comments.size > 0 && (
                <CommentMarkers
                  columns={columns}
                  comments={comments}
                  onOpen={onOpenComments}
                />
              )}

              {/* Monthly subgraphs below x-axis */}
              {showSubgraphs && granulation === 'month' && allMonthsData.map(({ month, historicalData }, index) => {
                // Use the corresponding filteredData point for positioning
                const dataPoint = filteredData[index];
                if (!dataPoint) return null;
                const monthX = xScale(parseDateForGranularity(dataPoint.date, granulation));
                const subgraphHeight = 80;
                const subgraphY = yMax + 30; // Position below x-axis

                // Calculate width based on distance to next tick
                let subgraphWidth: number;
                if (index < filteredData.length - 1) {
                  const nextMonthX = xScale(parseDateForGranularity(filteredData[index + 1].date, granulation));
                  subgraphWidth = nextMonthX - monthX;
                } else {
                  // Last subgraph extends to the end
                  subgraphWidth = xMax - monthX;
                }

                const subgraphX = monthX;

                return (
                  <SubGraph
                    key={`subgraph-${month}`}
                    month={month}
                    historicalData={historicalData}
                    subgraphWidth={subgraphWidth}
                    subgraphHeight={subgraphHeight}
                    subgraphX={subgraphX}
                    subgraphY={subgraphY}
                    globalMax={globalMax}
                    redline={redlineValues[index] ?? null}
                    greenline={greenlineValues[index] ?? null}
                    comments={comments}
                    onOpenComments={onOpenComments}
                  />
                );
              })}
            </g>
          </svg>
        );
      }}
    </ParentSize>
  );
};

export default ExperimentalChart;