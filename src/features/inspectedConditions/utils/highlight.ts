import { VisualizationMode } from "../store/dashboard.store";
import type { ColorScaleId } from "../store/dashboard.store";

/**
 * Highlight color per color scale. Plain yellow washes out against scales that
 * end in yellow (inferno, viridis, cividis…), so each scale gets a hue that
 * contrasts across its whole range.
 */
const SCALE_HIGHLIGHT: Record<ColorScaleId, string> = {
  interpolateInferno: "#22d3ee",           // cyan
  interpolateMagma: "#22d3ee",             // cyan
  interpolatePlasma: "#22d3ee",            // cyan
  interpolateViridis: "#ff2d55",           // red-pink
  interpolateCividis: "#ff2d55",           // red-pink
  interpolateCool: "#f59e0b",              // amber
  interpolateWarm: "#2563eb",              // blue
  interpolateCubehelixDefault: "#ff2d55",  // red-pink
};

// "By type" uses the discrete Tableau10 palette; a near-black marker (with a
// white halo at the call site) reads on any of those swatches.
const TYPE_HIGHLIGHT = "#111827";

/** Contrasting highlight color for the current visualization + color scale. */
export function getHighlightColor(visualization: VisualizationMode, scaleId: ColorScaleId): string {
  if (visualization === VisualizationMode.Type) return TYPE_HIGHLIGHT;
  return SCALE_HIGHLIGHT[scaleId] ?? "#22d3ee";
}
