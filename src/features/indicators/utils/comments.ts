import type { IndicatorComment } from "../api/comments";
import { COMMENT_TYPES } from "../api/comments";
import { formatCZ } from "@lib/date";

/**
 * Presentation rules for indicator comments — colours and labels shared by
 * every place comments are drawn (subgraph dots today, the main chart later).
 */

/** Dot / marker colour per comment type. Both are picked to stand out against
 *  the chart's blue data points and the grey sub-graph background, and to stay
 *  clear of the red/green threshold lines. */
const COMMENT_COLORS: Record<string, string> = {
  mitigation: "#f97316",   // orange — an action was taken
  explanation: "#4ade80",  // light green — the period is explained, not acted on
};
const COMMENT_COLOR_FALLBACK = "#f97316";

/** Colour for a marker that stands for a whole period. A period can hold
 *  several comments; mitigation wins, because an action taken is the more
 *  significant fact about the period. Prefer `commentColors` for marks that can
 *  show more than one colour — this is for single comments and flat swatches. */
export function commentDotColor(comments: IndicatorComment[]): string {
  if (comments.some((c) => c.commentType === "mitigation")) return COMMENT_COLORS.mitigation;
  const first = comments.find((c) => c.commentType)?.commentType;
  return (first && COMMENT_COLORS[first]) || COMMENT_COLOR_FALLBACK;
}

/**
 * Every distinct colour present in a period's comments, in a stable order
 * (known types first, in `COMMENT_TYPES` order, then any unknown type). A month
 * holding both an explanation and a mitigation yields two colours, which the
 * marker draws as bands so it's visible that both kinds are there.
 */
export function commentColors(comments: IndicatorComment[]): string[] {
  const present = new Set(comments.map((c) => c.commentType ?? ""));
  const known = COMMENT_TYPES.filter((t) => present.has(t)) as string[];
  const unknown = [...present].filter((t) => !known.includes(t)).sort();

  const colors: string[] = [];
  for (const type of [...known, ...unknown]) {
    const color = COMMENT_COLORS[type] || COMMENT_COLOR_FALLBACK;
    if (!colors.includes(color)) colors.push(color);
  }
  return colors.length ? colors : [COMMENT_COLOR_FALLBACK];
}

/** Stable SVG id for the gradient that paints a given colour list. */
export function commentFillId(colors: string[]): string {
  return `comment-fill-${colors.map((c) => c.replace("#", "")).join("-")}`;
}

/** `fill` value for a marker: the plain colour when there's only one, otherwise
 *  a reference to the banded gradient (see CommentFillDefs). */
export function commentFill(colors: string[]): string {
  return colors.length === 1 ? colors[0] : `url(#${commentFillId(colors)})`;
}

/** Human-readable comment type; unknown types are shown as they come. */
export function commentTypeLabel(commentType: string): string {
  switch (commentType) {
    case "mitigation": return "Mitigation";
    case "explanation": return "Explanation";
    default: return commentType;
  }
}

/** A comment's date in the UI's dd.mm.yyyy form. */
export function formatCommentDate(date: string): string {
  return formatCZ(date) || date;
}
