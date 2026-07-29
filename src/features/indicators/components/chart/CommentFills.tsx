import React from "react";
import type { IndicatorComment } from "../../api/comments";
import { commentColors, commentFillId } from "../../utils/comments";

/**
 * Gradient definitions for comment markers whose period holds more than one
 * comment type. Each is a hard-stop left-to-right band per colour, so a marker
 * filled with it reads as "both kinds are here" rather than picking a winner.
 *
 * Rendered once per chart; the note icons and the sub-graph dots reference the
 * gradients by the id `commentFillId` derives from their colour list.
 */
export default function CommentFillDefs({
  comments,
}: {
  comments: Map<string, IndicatorComment[]>;
}) {
  // One gradient per distinct multi-colour combination in view.
  const combos = new Map<string, string[]>();
  for (const periodComments of comments.values()) {
    const colors = commentColors(periodComments);
    if (colors.length > 1) combos.set(commentFillId(colors), colors);
  }
  if (combos.size === 0) return null;

  return (
    <defs>
      {[...combos].map(([id, colors]) => (
        <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0">
          {colors.map((color, i) => (
            <React.Fragment key={color}>
              <stop offset={`${(i / colors.length) * 100}%`} stopColor={color} />
              <stop offset={`${((i + 1) / colors.length) * 100}%`} stopColor={color} />
            </React.Fragment>
          ))}
        </linearGradient>
      ))}
    </defs>
  );
}
