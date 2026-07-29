import type { IndicatorMetadata } from "../../api/indicators";
import RelatedIndicatorChart from "./RelatedIndicatorChart";
import MetadataSection from "./MetadataSection";

/**
 * Related-indicators tab: the selected indicator's reactive (lagging) and
 * system (leading) indicators as clickable line-chart cards, plus any detailed
 * dashboard endpoints.
 */
export default function RelatedIndicatorsTab({ selectedIndicator }: { selectedIndicator: IndicatorMetadata }) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {/* Related indicators — one subpanel per type (there may be both) */}
        {selectedIndicator.laggingIndicatorRefs.length > 0 && (
          <div style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 16
          }}>
            <div style={{
              padding: "12px 16px",
              backgroundColor: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: 600
            }}>
              Reactive indicators
            </div>
            <div style={{ padding: 16 }}>
              {selectedIndicator.laggingIndicatorRefs.map((uri, idx) => (
                <RelatedIndicatorChart key={idx} uri={uri} />
              ))}
            </div>
          </div>
        )}

        {selectedIndicator.leadingIndicatorRefs.length > 0 && (
          <div style={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 16
          }}>
            <div style={{
              padding: "12px 16px",
              backgroundColor: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: 600
            }}>
              System indicators
            </div>
            <div style={{ padding: 16 }}>
              {selectedIndicator.leadingIndicatorRefs.map((uri, idx) => (
                <RelatedIndicatorChart key={idx} uri={uri} />
              ))}
            </div>
          </div>
        )}

        {/* Detailed Dashboard Endpoints */}
        {selectedIndicator.detailedDashboardEndpoints.length > 0 && (
          <MetadataSection title="Detailed Dashboard Endpoints" items={selectedIndicator.detailedDashboardEndpoints} />
        )}
      </div>
    </div>
  );
}
