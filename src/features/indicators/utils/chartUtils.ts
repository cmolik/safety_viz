import { scaleTime, scaleLinear } from '@visx/scale';
import type { DailyData, DayStats, MonthStats, WeekStats } from '../types/dataTypes';

/**
 * Gets the day of year for a given date
 */
export const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date.getTime() - start.getTime()) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

/**
 * Parses date based on granularity with UTC consistency
 */
export const parseDateForGranularity = (dateStr: string, granularity: 'day' | 'week' | 'month'): Date => {
  if (granularity === 'day') {
    return new Date(dateStr);
  } else if (granularity === 'week') {
    // Date format: "YYYY-WW", e.g., "2024-01"
    const parts = dateStr.split('-');
    if (parts.length !== 2) throw new Error('Invalid format');
    const [yearStr, weekStr] = parts;
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);

    if (isNaN(year) || isNaN(week) || year < 1900 || year > 2100 || week < 1 || week > 53) {
      throw new Error('Invalid year or week values');
    }

    // Calculate start of ISO week using UTC consistently
    const janFourth = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = janFourth.getUTCDay() || 7; // 1=Monday, 7=Sunday
    const week1Start = new Date(Date.UTC(year, 0, 4 - dayOfWeek + 1));
    const targetDate = new Date(week1Start);
    targetDate.setUTCDate(week1Start.getUTCDate() + (week - 1) * 7);
    return targetDate;
  } else { // month
    // Date format: "YYYY-MM", e.g., "2024-01"
    const [yearStr, monthStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // JS months are 0-based
    return new Date(Date.UTC(year, month, 1)); // UTC-based
  }
};

/**
 * Computes aggregated month stats for historical min/max
 */
export const computeAggregatedMonthStats = (monthStats: MonthStats, currentYear: number): { [key: string]: { min: number, max: number, avg: number } } => {
  const aggregatedMonthStats: { [key: string]: { min: number, max: number, avg: number } } = {};

  for (let month = 1; month <= 12; month++) {
    const counts: number[] = [];
    Object.keys(monthStats).forEach(key => {
      if (key.endsWith(`-${month}`) && !key.startsWith(`${currentYear}-`)) {
        counts.push(monthStats[key].count);
      }
    });
    if (counts.length > 0) {
      aggregatedMonthStats[month.toString()] = {
        min: Math.min(...counts),
        max: Math.max(...counts),
        avg: counts.reduce((a, b) => a + b, 0) / counts.length
      };
    }
  }

  return aggregatedMonthStats;
};

/**
 * Computes aggregated month stats excluding specific period keys.
 * Used to build the historical area without current period values.
 */
export const computeAggregatedMonthStatsExcluding = (
  monthStats: MonthStats,
  excludePeriods: Set<string>,
): { [key: string]: { min: number; max: number; avg: number } } => {
  const byMonth: Record<number, number[]> = {};

  for (const key of Object.keys(monthStats)) {
    if (excludePeriods.has(key)) continue;
    const parts = key.split('-');
    if (parts.length !== 2) continue;
    const month = parseInt(parts[1], 10);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(monthStats[key].count);
  }

  const result: { [key: string]: { min: number; max: number; avg: number } } = {};
  for (const [month, counts] of Object.entries(byMonth)) {
    if (counts.length > 0) {
      result[month] = {
        min: Math.min(...counts),
        max: Math.max(...counts),
        avg: counts.reduce((a, b) => a + b, 0) / counts.length,
      };
    }
  }
  return result;
};

/**
 * Calculates historical min/max data points
 */
export const calculateHistoricalMinMax = (
  filteredData: DailyData[],
  granularity: 'day' | 'week' | 'month',
  dayStats: DayStats,
  weekStats: WeekStats,
  aggregatedMonthStats: { [key: string]: { min: number, max: number, avg?: number } }
): Array<{ date: string, min: number, max: number, avg?: number }> => {
  const historicalMinMax: Array<{ date: string, min: number, max: number, avg?: number }> = [];

  if (granularity === 'day') {
    // Use precomputed dayStats
    filteredData.forEach(currentPoint => {
      const doy = getDayOfYear(new Date(currentPoint.date));
      const stats = dayStats[doy.toString()];
      if (stats) {
        historicalMinMax.push({
          date: currentPoint.date,
          min: stats.min,
          max: stats.max
        });
      }
    });
  } else if (granularity === 'month') {
    // Use precomputed monthStats
    filteredData.forEach(currentPoint => {
      // For month granularity, date is "YYYY-MM", so parse month number
      const [, monthStr] = currentPoint.date.split('-');
      const month = parseInt(monthStr, 10);
      const stats = aggregatedMonthStats[month.toString()];
      if (stats) {
        historicalMinMax.push({
          date: currentPoint.date,
          min: stats.min,
          max: stats.max,
          avg: stats.avg
        });
      }
    });

    // Extend to next month for full visualization
    if (historicalMinMax.length > 0) {
      const lastPoint = historicalMinMax[historicalMinMax.length - 1];
      const [year, month] = lastPoint.date.split('-');
      const nextMonthNum = (parseInt(month) % 12) + 1;
      const nextYear = parseInt(year) + (nextMonthNum === 1 ? 1 : 0);
      const nextMonthStr = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}`;
      historicalMinMax.push({
        date: nextMonthStr,
        min: lastPoint.min,
        max: lastPoint.max,
        avg: lastPoint.avg
      });
    }
  } else if (granularity === 'week') {
    // Use precomputed weekStats
    filteredData.forEach(currentPoint => {
      // For week granularity, date is "YYYY-WW", so parse week number
      const [, weekStr] = currentPoint.date.split('-');
      const week = parseInt(weekStr, 10);
      const stats = weekStats[week.toString()];
      if (stats) {
        historicalMinMax.push({
          date: currentPoint.date,
          min: stats.min,
          max: stats.max
        });
      }
    });
  }

  return historicalMinMax;
};

/**
 * Creates scales for the main chart
 */
export const createScales = (filteredData: DailyData[], xMax: number, yMax: number, granularity: 'day' | 'week' | 'month', currentMax: number, historicalMax: number, thresholdMax = 0) => {
  // X Scale
  let domainMax = parseDateForGranularity(filteredData[filteredData.length - 1].date, granularity);
  if (granularity === 'month') {
    const extended = new Date(domainMax);
    extended.setMonth(extended.getMonth() + 1);
    domainMax = extended;
  }

  const xScale = scaleTime<number>({
    range: [0, xMax],
    domain: [
      parseDateForGranularity(filteredData[0].date, granularity),
      domainMax
    ],
  });

  // Y Scale — max of (historical min/max span, redline, greenline, value) plus
  // 10% headroom so the topmost line isn't drawn against the chart edge.
  const yMaxValue = Math.max(currentMax, historicalMax, thresholdMax) * 1.1;

  const yScale = scaleLinear<number>({
    range: [yMax, 0],
    domain: [0, yMaxValue],
    nice: true,
  });

  return { xScale, yScale, yMaxValue };
};

/**
 * Generates SVG path for filled area between min and max lines
 */
export const generateAreaPath = (
  historicalMinMax: Array<{ date: string, min: number, max: number }>,
  xScale: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  yScale: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  granularity: 'day' | 'week' | 'month'
): string => {
  if (historicalMinMax.length < 2) return '';

  const points = historicalMinMax;

  // Build min line points (step chart)
  const minPoints = [{ x: xScale(parseDateForGranularity(points[0].date, granularity)), y: yScale(points[0].min) }];
  for (let i = 1; i < points.length; i++) {
    const curX = xScale(parseDateForGranularity(points[i].date, granularity));
    const prevY = yScale(points[i - 1].min);
    const curY = yScale(points[i].min);
    minPoints.push({ x: curX, y: prevY }); // horizontal
    minPoints.push({ x: curX, y: curY }); // vertical
  }

  // Build max line points (step chart)
  const maxPoints = [{ x: xScale(parseDateForGranularity(points[0].date, granularity)), y: yScale(points[0].max) }];
  for (let i = 1; i < points.length; i++) {
    const curX = xScale(parseDateForGranularity(points[i].date, granularity));
    const prevY = yScale(points[i - 1].max);
    const curY = yScale(points[i].max);
    maxPoints.push({ x: curX, y: prevY }); // horizontal
    maxPoints.push({ x: curX, y: curY }); // vertical
  }

  // Combine min points forward and max points backward
  const allPoints = minPoints.concat(maxPoints.reverse());

  // Create path string
  let areaPath = `M ${allPoints[0].x} ${allPoints[0].y}`;
  for (let i = 1; i < allPoints.length; i++) {
    areaPath += ` L ${allPoints[i].x} ${allPoints[i].y}`;
  }
  areaPath += ' Z';

  return areaPath;
};