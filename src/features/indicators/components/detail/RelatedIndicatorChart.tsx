import { useMemo } from "react";
import { useIndicatorsStore } from "../../store/indicators.store";
import { useSelectIndicator } from "../../hooks/useIndicatorSelection";
import { applyValueMode } from "../../utils/valueMode";
import IndicatorLineChart from "../IndicatorLineChart";

/** Clickable line-chart card for a related indicator, looked up by URI. */
export default function RelatedIndicatorChart({ uri }: { uri: string }) {
  const { indicatorMetadata, indicatorData, historicalData, valueMode, selectedIndicatorUri } = useIndicatorsStore();
  const selectIndicator = useSelectIndicator();

  // Find the indicator metadata by URI
  const indicator = indicatorMetadata.find(ind => ind.uri === uri);
  const rawData = indicatorData[uri];
  const data = useMemo(
    () => (rawData ? applyValueMode(rawData, historicalData[uri], valueMode) : rawData),
    [rawData, historicalData, uri, valueMode]
  );
  const isSelected = selectedIndicatorUri === uri;

  if (!indicator) {
    return (
      <div style={{
        padding: 8,
        fontSize: 12,
        color: "#6b7280",
        fontStyle: "italic"
      }}>
        {uri} (metadata not found)
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        onClick={() => selectIndicator(uri)}
        style={{
          padding: "8px 12px",
          fontSize: 13,
          color: "#6b7280",
          backgroundColor: isSelected ? "#dbeafe" : "white",
          border: `1px solid ${isSelected ? "#3b82f6" : "#e5e7eb"}`,
          borderRadius: 6,
          cursor: "pointer",
          marginBottom: 8,
          transition: "all 0.2s"
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = "#f3f4f6";
            e.currentTarget.style.borderColor = "#3b82f6";
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = "white";
            e.currentTarget.style.borderColor = "#e5e7eb";
          }
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4, color: isSelected ? "#1e40af" : "#374151" }}>
          {indicator.id} - {indicator.title}
        </div>
        <div style={{ fontSize: 12, fontStyle: "italic" }}>No data available</div>
      </div>
    );
  }

  return (
    <div
      onClick={() => selectIndicator(uri)}
      style={{
        padding: "8px 12px",
        backgroundColor: isSelected ? "#dbeafe" : "white",
        border: `2px solid ${isSelected ? "#3b82f6" : "#e5e7eb"}`,
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.2s",
        marginBottom: 8
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "#f3f4f6";
          e.currentTarget.style.borderColor = "#3b82f6";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.backgroundColor = "white";
          e.currentTarget.style.borderColor = "#e5e7eb";
        }
      }}
    >
      <IndicatorLineChart
        indicator={indicator}
        data={data}
      />
    </div>
  );
}
