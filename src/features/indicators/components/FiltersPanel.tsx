import { useState } from "react";
import { useIndicatorsStore } from "../store/indicators.store";
import { VALUE_MODES } from "../utils/valueMode";
import EndDatePicker from "./EndDatePicker";

type Tab = "filters" | "settings" | "export";

type FiltersPanelProps = {
  onApplyFilters: () => void;
};

export default function FiltersPanel({ onApplyFilters }: FiltersPanelProps) {
  const [activeTab] = useState<Tab>("filters");
  const {
    filters,
    setEndDate,
    setRoundEndDate,
    loading,
    metadataLoading,
    loadingProgress,
    cancelLoad,
    valueMode,
    setValueMode,
  } = useIndicatorsStore();

  const isLoading = loading || metadataLoading;
  const canLoad = !!filters.endDate && !isLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Panel content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
        {activeTab === "filters" && (
          <div>
            <h4 style={{ marginTop: 12  }}>Period End Date <span style={{ color: "#ef4444" }}>*</span></h4>
            {!filters.endDate && (
              <div style={{
                padding: 8,
                marginBottom: 12,
                backgroundColor: "#fef3c7",
                border: "1px solid #fbbf24",
                borderRadius: 4,
                fontSize: 13,
                color: "#92400e"
              }}>
                ⚠️ Set end date to load data
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <EndDatePicker
                value={filters.endDate || ""}
                onChange={(iso) => setEndDate(iso || undefined)}
                roundEndDate={filters.roundEndDate}
                onRoundEndDateChange={setRoundEndDate}
                onSubmit={() => { if (canLoad) onApplyFilters(); }}
              />
            </div>

            {/* Value mode — re-reads the data already loaded, so it takes effect
                immediately rather than waiting for the next "Load data". */}
            <h4 style={{ marginTop: 20, marginBottom: 8 }}>Value</h4>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {VALUE_MODES.map((mode) => (
                <label
                  key={mode.id}
                  title={mode.hint}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 14,
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="indicator-value-mode"
                    checked={valueMode === mode.id}
                    onChange={() => setValueMode(mode.id)}
                    style={{ cursor: "pointer" }}
                  />
                  {mode.label}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4, color: "#6b7280" }}>
              {VALUE_MODES.find((m) => m.id === valueMode)?.hint}
              {valueMode !== "month" && (
                <> Only indicators reported as findings / movements can be averaged; the rest show "-".</>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "stretch" }}>
              {/* Load button doubles as the loading indicator: spinner + status on
                  line 1, "loaded / total" on line 2. minHeight keeps its size steady
                  when it swaps between "Load data" and the two-line loading state. */}
              <button
                onClick={onApplyFilters}
                disabled={!canLoad}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  minHeight: 40,
                  padding: "6px 16px",
                  backgroundColor: (canLoad || isLoading) ? "#3b82f6" : "#9ca3af",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: isLoading ? "default" : canLoad ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                {isLoading ? (
                  <>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {/* border-box so the 2px border sits inside the 14px box and
                          never exceeds the text line height (no vertical resize). */}
                      <span
                        aria-hidden
                        style={{
                          width: 14,
                          height: 14,
                          boxSizing: "border-box",
                          borderRadius: "50%",
                          border: "2px solid white",
                          borderTopColor: "transparent",
                          animation: "toast-spin 0.7s linear infinite",
                          display: "inline-block",
                          flex: "none",
                        }}
                      />
                      Loading data…
                    </span>
                    {loadingProgress && (
                      <span style={{ fontWeight: 500, fontSize: 12 }}>
                        {loadingProgress.loaded} / {loadingProgress.total} indicators loaded
                      </span>
                    )}
                  </>
                ) : (
                  "Load data"
                )}
              </button>

              <button
                onClick={() => cancelLoad()}
                disabled={!loading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "8px 16px",
                  backgroundColor: loading ? "#ef4444" : "#fca5a5",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: loading ? "pointer" : "not-allowed",
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
