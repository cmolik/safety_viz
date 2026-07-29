import React, { useState } from "react";
import { createPortal } from "react-dom";
import type { IndicatorComment } from "../../api/comments";
import { commentColors, commentFill, commentTypeLabel, formatCommentDate } from "../../utils/comments";

/**
 * Note icons for the main plot's month columns, sitting just above each month's
 * value on the current-year line. One icon per selected month that has comments;
 * hovering shows them, clicking opens the editor.
 */

type Props = {
  // One entry per chart column: its period key, centre x, and the baseline the
  // icon hangs above (the caller anchors this to the value line and clamps it).
  columns: Array<{ periodKey: string; centerX: number; iconY: number }>;
  // Period ("YYYY-M") -> that month's comments.
  comments: Map<string, IndicatorComment[]>;
  onOpen?: (periodKey: string, clientX: number, clientY: number) => void;
};

const ICON_W = 12;
const ICON_H = 16;

/** Icon height plus the badge's overhang — the caller needs it to keep icons
 *  inside the plot area when a month's value sits near the top. */
export const COMMENT_ICON_CLEARANCE = ICON_H + 5;

const CommentMarkers: React.FC<Props> = ({ columns, comments, onOpen }) => {
  const [tip, setTip] = useState<{ x: number; y: number; items: IndicatorComment[] } | null>(null);

  return (
    <>
      {columns.map(({ periodKey, centerX, iconY }) => {
        const items = comments.get(periodKey);
        if (!items?.length) return null;
        // A month holding both an explanation and a mitigation is painted with
        // both colours, split down the middle, rather than only the winner's.
        const fill = commentFill(commentColors(items));
        const x = centerX - ICON_W / 2;

        return (
          <g
            key={`comment-marker-${periodKey}`}
            transform={`translate(${x}, ${iconY - ICON_H})`}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, items })}
            onMouseMove={(e) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
            onMouseLeave={() => setTip(null)}
            onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(periodKey, e.clientX, e.clientY); } : undefined}
          >
            {/* Note glyph: a portrait page with a folded corner and three rules.
                The rules are dark rather than white so they stay legible on the
                light-green explanation fill as well as the orange one. */}
            <path
              d={`M0,0 H${ICON_W - 4} L${ICON_W},4 V${ICON_H} H0 Z`}
              fill={fill}
              stroke="white"
              strokeWidth={1.25}
              strokeLinejoin="round"
            />
            <line x1={2.5} y1={7} x2={ICON_W - 2.5} y2={7} stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
            <line x1={2.5} y1={10} x2={ICON_W - 2.5} y2={10} stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
            <line x1={2.5} y1={13} x2={ICON_W - 4.5} y2={13} stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
            {/* Count badge, only when the month holds more than one comment.
                Sits on the icon's top-right corner rather than above it — the
                legend's bottom edge is only 4px clear of the icon row. */}
            {items.length > 1 && (
              <>
                <circle cx={ICON_W} cy={2} r={5} fill="#1f2937" />
                <text x={ICON_W} y={4.5} textAnchor="middle" fontSize={7} fontWeight={700} fill="white">
                  {items.length > 9 ? "9+" : items.length}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Hover tooltip — same black box the sub-graph dots use. */}
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
          <div style={{ fontSize: 10, opacity: 0.6 }}>Click to edit</div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default CommentMarkers;
