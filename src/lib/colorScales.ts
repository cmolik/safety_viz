//src/lib/colorScales.ts

import * as d3 from "d3";

/** Ids of the d3 interpolators offered as sequential color scales. */
export type ColorScaleId =
  | "interpolateInferno" | "interpolateViridis" | "interpolateMagma"
  | "interpolatePlasma" | "interpolateCividis" | "interpolateCool"
  | "interpolateWarm" | "interpolateCubehelixDefault";

// Color scale list
export const COLOR_SCALE_OPTIONS = [
  "interpolateInferno",
  "interpolateViridis",
  "interpolateMagma",
  "interpolatePlasma",
  "interpolateCividis",
  "interpolateCool",
  "interpolateWarm",
  "interpolateCubehelixDefault",
] as const satisfies readonly ColorScaleId[];

// Mapping id → interpolator
export const COLOR_INTERP: Record<ColorScaleId, (t: number) => string> = {
  interpolateInferno: d3.interpolateInferno,
  interpolateViridis: d3.interpolateViridis,
  interpolateMagma: d3.interpolateMagma,
  interpolatePlasma: d3.interpolatePlasma,
  interpolateCividis: d3.interpolateCividis,
  interpolateCool: d3.interpolateCool,
  interpolateWarm: d3.interpolateWarm,
  interpolateCubehelixDefault: d3.interpolateCubehelixDefault,
};

// Safe helper (if someone passes an invalid id, returns a grey scale)
export function getInterpolator(id: ColorScaleId): (t: number) => string {
  return COLOR_INTERP[id] ?? ((t: number) => d3.interpolateGreys(t));
}

/** Palette for "By type" mode */
export const PALETTE = d3.schemeTableau10;

/**
 * Deterministic palette color for a type id, by its index in the type domain.
 * Unknown ids fall back to the first palette color.
 */
export function colorByType(id: string, domain: readonly string[]): string {
  const i = Math.max(0, domain.indexOf(id));
  return PALETTE[i % PALETTE.length];
}

/**
 * Build a leaflet.heat `gradient` ({ position 0..1 → color }) from a d3
 * interpolator. Stops start at 0.2 so the sparsest areas fade out rather than
 * painting the whole map with the interpolator's low end.
 */
export function interpolatorToHeatGradient(
  interp: (t: number) => string,
  stops = 5,
): Record<number, string> {
  const gradient: Record<number, string> = {};
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    const pos = Number((0.2 + 0.8 * t).toFixed(3));
    gradient[pos] = interp(t);
  }
  return gradient;
}
