import { useState, useEffect } from "react";
import type { IndicatorMetadata, IndicatorOverviewDataPoint, StpaInteraction } from "../../api/indicators";
import { buildStpaSvgUrl } from "../../utils/stpaHighlight";
import AssumptionsSection from "./AssumptionsSection";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

type ControlStructureTabProps = {
  stpaDiagram: string | null;
  stpaInteractions: StpaInteraction[] | null;
  selectedIndicator: IndicatorMetadata;
  /** Mode-applied series — its last point's status colors the highlight. */
  selectedIndicatorData: IndicatorOverviewDataPoint[] | null;
};

/**
 * STPA analysis tab: the control-structure SVG (with the selected indicator's
 * interactions highlighted in its status color), zoom controls, and the
 * indicator's assumptions.
 */
export default function ControlStructureTab({
  stpaDiagram,
  stpaInteractions,
  selectedIndicator,
  selectedIndicatorData,
}: ControlStructureTabProps) {
  const [svgZoom, setSvgZoom] = useState(1);

  // SVG (as a blob URL) with viewport fixed and matching interactions
  // highlighted. Created AND revoked inside one effect so setup/cleanup stay
  // symmetric: this tab mounts with the diagram already loaded, and a
  // useMemo-created URL revoked in a cleanup would stay revoked across
  // StrictMode's mount → cleanup → mount cycle (broken image on every mount).
  const [svgDataUrl, setSvgDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!stpaDiagram) {
      setSvgDataUrl(null);
      return;
    }
    const url = buildStpaSvgUrl(stpaDiagram, selectedIndicator, selectedIndicatorData, stpaInteractions);
    setSvgDataUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [stpaDiagram, selectedIndicator, selectedIndicatorData, stpaInteractions]);

  const handleZoomIn = () => setSvgZoom(prev => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
  const handleZoomOut = () => setSvgZoom(prev => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
  const handleZoomReset = () => setSvgZoom(1);

  const zoomButtonStyle = {
    padding: "6px 12px",
    backgroundColor: "white",
    border: "1px solid #d1d5db",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  } as const;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%"
    }}>
      {/* Scrollable Content Container — the zoom controls live inside it
          (not pinned), so they scroll away with the size-constrained SVG and
          the STPA sections below it. Top padding is dropped so the controls
          bar starts flush at the top. */}
      <div style={{
        flex: 1,
        overflow: "auto",
        padding: "0 16px 16px",
        backgroundColor: "#f3f4f6"
      }}>
        {/* Zoom Controls (full-bleed bar, scrolls with the content) */}
        <div style={{
          display: "flex",
          gap: 8,
          margin: "0 -16px",
          padding: "12px 16px",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
          alignItems: "center"
        }}>
          <button onClick={handleZoomIn} style={zoomButtonStyle} title="Zoom In">+</button>
          <button onClick={handleZoomOut} style={zoomButtonStyle} title="Zoom Out">-</button>
          <button onClick={handleZoomReset} style={zoomButtonStyle} title="Reset Zoom">Reset</button>
          <span style={{
            marginLeft: 8,
            fontSize: 13,
            color: "#6b7280"
          }}>
            {Math.round(svgZoom * 100)}%
          </span>
        </div>

        {/* SVG */}
        <div style={{
          flex: 1,
          overflow: "auto",
          backgroundColor: "#f3f4f6",
          marginTop: 16,
          marginBottom: 16
        }}>
          <div style={{
            display: "inline-block",
            minWidth: "100%",
            minHeight: "461px",
            maxHeight: "461px",
            maxWidth: "100%"
          }}>
            <img
              src={svgDataUrl || undefined}
              alt="STPA Control Structure"
              style={{
                width: `${svgZoom * 100}%`,
                height: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                backgroundColor: "white",
                display: "block"
              }}
            />
          </div>
        </div>

        {/* Assumptions */}
        {selectedIndicator.assumptions && selectedIndicator.assumptions.length > 0 && (
          <AssumptionsSection assumptions={selectedIndicator.assumptions} />
        )}
      </div>
    </div>
  );
}
