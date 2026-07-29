import type { IndicatorMetadata, IndicatorOverviewDataPoint, StpaInteraction } from "../api/indicators";

// The backend renders the control-structure SVG at this fixed size; the width/
// height attributes are forced so the <img> scales it predictably.
const SVG_WIDTH = 750;
const SVG_HEIGHT = 505;

/** Status color of the indicator's last data point (red/orange/green), or null
 *  when there is no data or no thresholds to judge it against. */
function statusHighlightColor(data: IndicatorOverviewDataPoint[] | null): string | null {
  if (!data || data.length === 0) return null;
  const lastPoint = data[data.length - 1];
  const value = lastPoint.value ?? 0;
  if (lastPoint.redline !== null && value > lastPoint.redline) return '#dc2626'; // red
  if (lastPoint.greenline !== null && lastPoint.redline !== null && value > lastPoint.greenline && value <= lastPoint.redline) return '#f59e0b'; // orange
  if (lastPoint.greenline !== null && value <= lastPoint.greenline) return '#16a34a'; // green
  return null;
}

/**
 * Prepares the STPA control-structure SVG for display: forces a fixed viewport
 * size, and — when the selected indicator's `groups` match control-structure
 * interactions — recolors the matched links with the indicator's status color.
 * Returns a blob URL for an <img>; callers must revoke it when done.
 */
export function buildStpaSvgUrl(
  stpaDiagram: string,
  selectedIndicator: IndicatorMetadata | null,
  selectedIndicatorData: IndicatorOverviewDataPoint[] | null,
  stpaInteractions: StpaInteraction[] | null,
): string {
  let modifiedSvg = stpaDiagram;

  // Force the viewport: strip any width/height and set the fixed render size.
  const svgTagMatch = modifiedSvg.match(/<svg[^>]*>/i);
  if (svgTagMatch) {
    const originalTag = svgTagMatch[0];
    let newTag = originalTag
      .replace(/\s+width="[^"]*"/gi, '')
      .replace(/\s+height="[^"]*"/gi, '');
    newTag = newTag.replace(/>$/, ` width="${SVG_WIDTH}" height="${SVG_HEIGHT}">`);
    modifiedSvg = modifiedSvg.replace(originalTag, newTag);
  }

  // Highlight SVG elements based on the selected indicator's groups.
  if (selectedIndicator && selectedIndicator.groups.length > 0 && stpaInteractions && stpaInteractions.length > 0) {
    const highlightColor = statusHighlightColor(selectedIndicatorData);

    // Parse groups ("from--to--interaction") and match against interactions.
    const matchedLinkIds = new Set<string>();
    for (const group of selectedIndicator.groups) {
      const parts = group.split('--');
      if (parts.length !== 3) continue;
      const [fromLabel, toLabel, interactionLabel] = parts;

      for (const interaction of stpaInteractions) {
        if (
          interaction.fromLabel === fromLabel &&
          interaction.toLabel === toLabel &&
          interaction.interactionLabel === interactionLabel
        ) {
          matchedLinkIds.add(interaction.interactionId);
        }
      }
    }

    // Apply highlighting using DOMParser.
    // Structure: <g data-link-id="X"> → <path joint-selector="line"> has the visible stroke.
    if (matchedLinkIds.size > 0) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(modifiedSvg, 'image/svg+xml');

        for (const linkId of matchedLinkIds) {
          const linkEl = doc.querySelector(`[data-link-id="${linkId}"]`);
          if (linkEl && highlightColor != null) {
            const linePath = linkEl.querySelector('path[joint-selector="line"]');
            if (linePath) {
              linePath.setAttribute('stroke', highlightColor);
              linePath.setAttribute('stroke-width', '3');
            }
            const bodyRect = linkEl.querySelector('rect');
            if (bodyRect) bodyRect.setAttribute('fill', highlightColor);
            const bodyText = linkEl.querySelector('text');
            if (bodyText) bodyText.setAttribute('fill', '#FFFFFF');
          }
        }

        const serializer = new XMLSerializer();
        modifiedSvg = serializer.serializeToString(doc.documentElement);
      } catch (e) {
        console.warn('Failed to highlight SVG elements:', e);
      }
    }
  }

  const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' });
  return URL.createObjectURL(blob);
}
