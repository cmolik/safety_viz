import React from 'react';
import { Line } from '@visx/shape';
import { GridColumns } from '@visx/grid';
import { AxisBottom, AxisLeft } from '@visx/axis';
import type { DailyData } from '../../types/dataTypes';
import { parseDateForGranularity } from '../../utils/chartUtils';

/**
 * Historical min/max band color — a single source of truth shared by the band
 * fill and the legend swatch (they used to be defined separately and mismatch).
 * The band is kept light/transparent; the per-month average line uses a darker
 * tone of the same hue so they read as one family.
 */
export const MINMAX_COLOR = '#4f74a1';
export const MINMAX_BAND_OPACITY = 0.15;
export const AVG_COLOR = '#4f74a1';
export const AVG_COLOR_OPACITY = 0.2;

/**
 * Props for chart rendering components
 */
export interface ChartComponentsProps {
  filteredData: DailyData[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  xScale: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yScale: any;
  xMax: number;
  yMax: number;
  yMaxValue: number;
  areaPath: string;
  historicalMinMax: Array<{ date: string, min: number, max: number }>;
  granularity: 'day' | 'week' | 'month';
  width: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

/**
 * Renders the grid lines for the chart
 */
export const ChartGrid: React.FC<{
  granularity: 'day' | 'week' | 'month';
  xScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  yMax: number;
}> = ({ granularity, xScale, yMax }) => {
  if (granularity === 'month') {
    return (
      <GridColumns
        scale={xScale}
        height={yMax}
        numTicks={12}
        stroke="#e0e0e0"
        strokeWidth={1}
        opacity={0.8}
      />
    );
  }

  if (granularity === 'week') {
    return (
      <g style={{ transform: 'translate(6,0)' }}>
        <GridColumns
          scale={xScale}
          height={yMax}
          numTicks={52}
          stroke="#e0e0e0"
          strokeWidth={1}
          opacity={0.8}
        />
      </g>
    );
  }

  return null;
};

/**
 * Renders the filled area between historical min/max lines
 */
export const HistoricalArea: React.FC<{ areaPath: string }> = ({ areaPath }) => {
  return areaPath ? (
    <path d={areaPath} fill={MINMAX_COLOR} opacity={MINMAX_BAND_OPACITY} />
  ) : null;
};

/**
 * Renders the per-month historical average as a stepped line across the chart,
 * in a darker tone of the min/max band color. Skips columns without an average.
 */
export const HistoricalAvgLine: React.FC<{
  historicalMinMax: Array<{ date: string, min: number, max: number, avg?: number }>;
  xScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  yScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  granularity: 'day' | 'week' | 'month';
}> = ({ historicalMinMax, xScale, yScale, granularity }) => {
  return (
    <>
      {historicalMinMax.map((point, index) => {
        if (index === 0) return null;
        const prevPoint = historicalMinMax[index - 1];
        if (prevPoint.avg == null || point.avg == null) return null;
        const horX = xScale(parseDateForGranularity(point.date, granularity));
        const prevX = xScale(parseDateForGranularity(prevPoint.date, granularity));
        const horY = yScale(prevPoint.avg);
        const vertY = yScale(point.avg);
        return (
          <React.Fragment key={`avg-${index}`}>
            <Line from={{ x: prevX, y: horY }} to={{ x: horX, y: horY }} stroke={AVG_COLOR} strokeWidth={2} strokeLinecap="round" opacity={AVG_COLOR_OPACITY} />
            <Line from={{ x: horX, y: horY }} to={{ x: horX, y: vertY }} stroke={AVG_COLOR} strokeWidth={2} strokeLinecap="round" opacity={AVG_COLOR_OPACITY} />
          </React.Fragment>
        );
      })}
    </>
  );
};

/**
 * Clamps a threshold line's y-coordinate into view. The chart's Y domain is
 * driven by the data values, so a redline/greenline can fall outside it; rather
 * than drawing it far off-canvas, pin it just above the top of the plot (value
 * above the domain) or just below the baseline (value below 0).
 */
const OUT_OF_RANGE_OFFSET = 6;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clampThresholdY(value: number, yScale: any): number {
  const range = yScale.range(); // [yMax (bottom), 0 (top)]
  const top = Math.min(range[0], range[1]);
  const bottom = Math.max(range[0], range[1]);
  const y = yScale(value);
  if (y < top) return top - OUT_OF_RANGE_OFFSET;       // above domain -> just above graph
  if (y > bottom) return bottom + OUT_OF_RANGE_OFFSET;  // below 0 -> just below baseline
  return y;
}

/**
 * Renders the redline as a stepped horizontal line across the chart
 */
export const RedlineLine: React.FC<{
  filteredData: DailyData[];
  redlineValues: (number | null)[];
  xScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  yScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  xMax: number;
  granularity: 'day' | 'week' | 'month';
  partialLastColumn?: boolean;
}> = ({ filteredData, redlineValues, xScale, yScale, xMax, granularity, partialLastColumn }) => {
  return (
    <>
      {filteredData.map((d, index) => {
        const val = redlineValues[index];
        if (val === null || val === undefined) return null;
        const x1 = xScale(parseDateForGranularity(d.date, granularity));
        const isLast = index === filteredData.length - 1;
        let x2 = isLast ? xMax : xScale(parseDateForGranularity(filteredData[index + 1].date, granularity));
        if (isLast && partialLastColumn) x2 = x1 + (x2 - x1) / 2; // partial final month -> half width
        const y = clampThresholdY(val, yScale);
        return (
          <Line
            key={`redline-${index}`}
            from={{ x: x1, y }}
            to={{ x: x2, y }}
            stroke="#dc2626"
            strokeWidth={2}
            strokeDasharray="6,3"
          />
        );
      })}
    </>
  );
};

/**
 * Renders the greenline as a stepped horizontal line across the chart
 */
export const GreenlineLine: React.FC<{
  filteredData: DailyData[];
  greenlineValues: (number | null)[];
  xScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  yScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  xMax: number;
  granularity: 'day' | 'week' | 'month';
  partialLastColumn?: boolean;
}> = ({ filteredData, greenlineValues, xScale, yScale, xMax, granularity, partialLastColumn }) => {
  return (
    <>
      {filteredData.map((d, index) => {
        const val = greenlineValues[index];
        if (val === null || val === undefined) return null;
        const x1 = xScale(parseDateForGranularity(d.date, granularity));
        const isLast = index === filteredData.length - 1;
        let x2 = isLast ? xMax : xScale(parseDateForGranularity(filteredData[index + 1].date, granularity));
        if (isLast && partialLastColumn) x2 = x1 + (x2 - x1) / 2; // partial final month -> half width
        const y = clampThresholdY(val, yScale);
        return (
          <Line
            key={`greenline-${index}`}
            from={{ x: x1, y }}
            to={{ x: x2, y }}
            stroke="#16a34a"
            strokeWidth={2}
            strokeDasharray="6,3"
          />
        );
      })}
    </>
  );
};

/**
 * Renders the current year data lines
 */
export const CurrentYearLines: React.FC<{
  filteredData: DailyData[];
  xScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  yScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  xMax: number;
  granularity: 'day' | 'week' | 'month';
  partialLastColumn?: boolean;
}> = ({ filteredData, xScale, yScale, xMax, granularity, partialLastColumn }) => {
  const getDate = (d: DailyData) => d.date;
  const getCount = (d: DailyData) => d.count;

  return (
    <>
      {filteredData.map((d: DailyData, index) => {
        if (index === 0) return null;
        const prevPoint = filteredData[index - 1];

        const barStartPadding = 0;
        const horX = xScale(parseDateForGranularity(getDate(d), granularity));
        const prevY = yScale(getCount(prevPoint));
        const curY = yScale(getCount(d));
        const prevX = xScale(parseDateForGranularity(getDate(prevPoint), granularity));
        const effectivePrevX = index === 1 ? prevX + barStartPadding : prevX;

        return (
          <React.Fragment key={`current-year-${index}`}>
            <Line
              from={{
                x: effectivePrevX,
                y: prevY
              }}
              to={{
                x: horX,
                y: prevY
              }}
              stroke="#228ff5ff"
              opacity={1}
              strokeWidth={3}
              strokeLinecap="round"
            />
            {index < filteredData.length && (
              <Line
                from={{
                  x: horX,
                  y: prevY
                }}
                to={{
                  x: horX,
                  y: curY
                }}
                stroke="#007bff"
                opacity={0.5}
                strokeWidth={3}
                strokeLinecap="round"
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Extend main line to next month if month granularity */}
      {granularity === 'month' && filteredData.length > 0 && (() => {
        const lastPoint = filteredData[filteredData.length - 1];
        const lastX = xScale(parseDateForGranularity(lastPoint.date, granularity));
        const lastY = yScale(getCount(lastPoint));
        // Draw the final month's segment only half-way when its data is partial.
        const endX = partialLastColumn ? lastX + (xMax - lastX) / 2 : xMax;
        return (
          <Line
            key="extend-main"
            from={{ x: lastX, y: lastY }}
            to={{ x: endX, y: lastY }}
            stroke="#228ff5ff"
            opacity={1}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })()}
    </>
  );
};

/**
 * Renders the chart legend
 */
export const ChartLegend: React.FC = () => {
  return (
    <g transform={`translate(33, -50)`}>
      <rect width={590} height={30} fill="white" stroke="#ccc" strokeWidth={1} rx={5} opacity={0.9} />
      <line x1={20} y1={15} x2={40} y2={15} stroke="#007bff" strokeWidth={3} />
      <text x={45} y={19} fontSize={13} fill="#333">Value</text>
      {/* Min/Max band swatch — same color/opacity as the band in the chart */}
      <rect x={110} y={10} width={20} height={10} fill={MINMAX_COLOR} opacity={MINMAX_BAND_OPACITY} />
      <text x={135} y={19} fontSize={13} fill="#333">Historical Min/Max Span</text>
      {/* Average line swatch — darker tone of the band color */}
      <line x1={305} y1={15} x2={325} y2={15} stroke={AVG_COLOR} strokeWidth={3} strokeLinecap="round" opacity={AVG_COLOR_OPACITY} />
      <text x={330} y={19} fontSize={13} fill="#333">Average</text>
      <line x1={410} y1={15} x2={430} y2={15} stroke="#dc2626" strokeWidth={2} strokeDasharray="6,2" />
      <text x={435} y={19} fontSize={13} fill="#333">Red</text>
      <line x1={493} y1={15} x2={513} y2={15} stroke="#16a34a" strokeWidth={2} strokeDasharray="6,2" />
      <text x={518} y={19} fontSize={13} fill="#333">Green</text>
    </g>
  );
};

/**
 * Renders chart axes
 */
export const ChartAxes: React.FC<{
  xScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  yScale: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  yMax: number;
  filteredData: DailyData[];
  granularity: 'day' | 'week' | 'month';
}> = ({ xScale, yScale, yMax, filteredData, granularity }) => {
  return (
    <>
      <AxisBottom
        top={yMax}
        scale={xScale}
        stroke="#333"
        tickStroke="#333"
        tickValues={granularity === 'month' ? filteredData.map(d => parseDateForGranularity(d.date, granularity)) : undefined}
        // Month labels omitted from the main axis — the monthly subgraphs below carry the numbers.
        tickFormat={granularity === 'month' ? () => '' : undefined}
        tickLabelProps={() => ({
          fill: '#333',
          fontSize: 11,
          textAnchor: 'middle',
        })}
      />
      <AxisLeft
        scale={yScale}
        stroke="#333"
        tickStroke="#333"
        tickLabelProps={() => ({
          fill: '#333',
          fontSize: 11,
          textAnchor: 'end',
        })}
      />
    </>
  );
};