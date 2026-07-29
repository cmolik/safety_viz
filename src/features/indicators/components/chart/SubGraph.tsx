import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Line } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import type { IndicatorComment } from '../../api/comments';
import { commentColors, commentFill, formatCommentDate, commentTypeLabel } from '../../utils/comments';

interface SubGraphProps {
  month: string;
  historicalData: Array<{ year: string; count: number }>;
  subgraphWidth: number;
  subgraphHeight: number;
  subgraphX: number;
  subgraphY: number;
  globalMax: number;
  redline: number | null;
  greenline: number | null;
  // Period ("YYYY-M") -> the selected indicator's comments for that month; a dot
  // for a period that has any is drawn in the comment colour and shows them in a
  // tooltip on hover.
  comments?: Map<string, IndicatorComment[]>;
  // Opens the comment editor for a dot's period. This is how months outside the
  // main chart's 12-month window are reached.
  onOpenComments?: (periodKey: string, clientX: number, clientY: number) => void;
}

/**
 * Renders a single monthly subgraph below the main chart
 */
const SubGraph: React.FC<SubGraphProps> = ({
  month,
  historicalData,
  subgraphWidth,
  subgraphHeight,
  subgraphX,
  subgraphY,
  globalMax,
  redline,
  greenline,
  comments,
  onOpenComments,
}) => {
  // Comment tooltip (black, portal to body, positioned at the cursor).
  const [tip, setTip] = useState<{ x: number; y: number; items: IndicatorComment[] } | null>(null);

  // Plot area inside the box: the month title sits above it and the year labels
  // just below it, with inner padding so dots/lines never touch either.
  const PLOT_TOP = 20;                       // below the month title
  const PLOT_BOTTOM = subgraphHeight - 20;   // above the year labels
  const YEAR_LABEL_Y = subgraphHeight - 5;   // just under the plot, near the box bottom

  const years = historicalData.map(h => parseInt(h.year));
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const subXScale = scaleLinear<number>({
    range: [0, subgraphWidth - 20],
    domain: minYear === maxYear ? [minYear - 0.5, maxYear + 0.5] : [minYear, maxYear],
  });
  const subYScale = scaleLinear<number>({
    range: [PLOT_BOTTOM, PLOT_TOP],
    domain: [0, globalMax],
  });

  // Clamp a y-coordinate into the plot area so points and threshold lines never
  // leak outside the subgraph box (e.g. when a threshold is far above globalMax).
  const clampY = (y: number) => Math.max(PLOT_TOP, Math.min(PLOT_BOTTOM, y));

  return (
    <g key={`subgraph-${month}`} transform={`translate(${subgraphX}, ${subgraphY - 20})`}>
      {/* Background rectangle */}
      <rect
        x={0}
        y={0}
        width={subgraphWidth}
        height={subgraphHeight}
        fill="#f8f9fa"
        stroke="#ddd"
        strokeWidth={1}
      />

      {/* Month label — month number (1–12), in line with the indicator list chart */}
      <text
        x={subgraphWidth / 2}
        y={12}
        textAnchor="middle"
        fontSize={12}
        fill="#666"
      >
        {month}
      </text>

      {/* Redline (clamped into the plot area) */}
      {redline !== null && (
        <Line
          from={{ x: 5, y: clampY(subYScale(redline)) }}
          to={{ x: subgraphWidth - 5, y: clampY(subYScale(redline)) }}
          stroke="#dc2626"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      )}
      {/* Greenline (clamped into the plot area) */}
      {greenline !== null && (
        <Line
          from={{ x: 5, y: clampY(subYScale(greenline)) }}
          to={{ x: subgraphWidth - 5, y: clampY(subYScale(greenline)) }}
          stroke="#16a34a"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      )}

      {/* Trend lines */}
      {historicalData.map((point, i) => {
        if (i === 0) return null;
        const prev = historicalData[i - 1];
        return (
          <line
            key={`subline-${i}`}
            x1={subXScale(parseInt(prev.year)) + 5}
            y1={clampY(subYScale(prev.count))}
            x2={subXScale(parseInt(point.year)) + 5}
            y2={clampY(subYScale(point.count))}
            stroke="#007bff"
            strokeWidth={1.5}
          />
        );
      })}

      {/* Data points */}
      {historicalData.map((point, index) => {
        const cx = subXScale(parseInt(point.year)) + 5;
        const cy = clampY(subYScale(point.count));
        // Comments for this exact period (year + this subgraph's month)?
        const periodKey = `${parseInt(point.year, 10)}-${parseInt(month, 10)}`;
        const periodComments = comments?.get(periodKey);
        const hasComments = !!periodComments?.length;
        // Dots are clickable whenever an editor is wired up — including empty
        // ones, so a historical month can have its first comment added.
        const clickable = !!onOpenComments;
        return (
          <g key={`subpoint-group-${point.year}`}>
            {/* A commented year is drawn bigger and with a heavier white ring,
                so it reads as a marker rather than as another data point. */}
            <circle
              cx={cx}
              cy={cy}
              r={hasComments ? 5 : 3}
              fill={hasComments ? commentFill(commentColors(periodComments!)) : "#007bff"}
              stroke="white"
              strokeWidth={hasComments ? 1.5 : 0.5}
              pointerEvents="none"
            />
            {/* Invisible hit target — the dots are 3-4px, too small to click or
                hover reliably. Kept at r=6 so neighbouring years don't overlap. */}
            {(hasComments || clickable) && (
              <circle
                cx={cx}
                cy={cy}
                r={6}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={hasComments ? (e) => setTip({ x: e.clientX, y: e.clientY, items: periodComments! }) : undefined}
                onMouseMove={hasComments ? (e) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t)) : undefined}
                onMouseLeave={hasComments ? () => setTip(null) : undefined}
                onClick={onOpenComments ? (e) => { e.stopPropagation(); setTip(null); onOpenComments(periodKey, e.clientX, e.clientY); } : undefined}
              />
            )}
            {(index === 0 || index === historicalData.length - 1) && (
              <text
                x={cx + 7 + (index === 0 ? 3 : index === historicalData.length - 1 ? -5 : 0)}
                y={YEAR_LABEL_Y}
                textAnchor="middle"
                fontSize={9}
                fill="#666"
              >
                {point.year}
              </text>
            )}
          </g>
        );
      })}

      {/* Comment tooltip — black box near the cursor (portal -> body). Lists every
          comment of the hovered period with its date and type. */}
      {tip && createPortal(
        <div style={{
          position: "fixed",
          left: tip.x + 12,
          top: tip.y + 12,
          zIndex: 2000,
          maxWidth: 320,
          padding: "6px 10px",
          backgroundColor: "#1f2937",
          color: "white",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          {tip.items.map((c, i) => (
            <div key={c.uri || `${c.date}-${i}`}>
              <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>
                {formatCommentDate(c.date)}
                {c.commentType ? ` · ${commentTypeLabel(c.commentType)}` : ""}
              </div>
              {c.comment}
            </div>
          ))}
        </div>,
        document.body
      )}
    </g>
  );
};

export default SubGraph;