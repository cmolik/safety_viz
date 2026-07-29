import VisualizationPicker from "./filters/VisualizationPicker";
import TimeFilter from "./filters/TimeFilter";
import EventTypeFilter from "./filters/EventTypeFilter";
import PositionFilter from "./filters/PositionFilter";
import DiscrepancyFilter from "./filters/DiscrepancyFilter";
import ColumnFilters from "./filters/ColumnFilters";
import { useIndicatorUri } from "../store/dashboard.store";
import { useIndicatorSchema } from "../hooks/useIndicatorSchema";
import { getSchemaPrimaryColumn } from "../utils/indicatorProfile";

type FiltersPanelProps = {
  /** True while a data load is in flight — swaps "Load data" for a spinner. */
  loading?: boolean;
  /** True when the date range changed and cleared loaded data (needs a reload). */
  periodChanged?: boolean;
  onLoad?: () => void;
  onCancel?: () => void;
};

/** Load / Cancel row shown below Period. Data loads only on page start and when
 * "Load data" is pressed, so this is the sole way to (re)trigger a fetch. */
function LoadControls({ loading, periodChanged, onLoad, onCancel }: Required<Pick<FiltersPanelProps, "loading" | "periodChanged" | "onLoad" | "onCancel">>) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {/* Same <button> element in both states — only its children swap — so the
          box never resizes when loading starts. */}
      <button
        type="button"
        onClick={() => { if (!loading) onLoad(); }}
        aria-busy={loading}
        style={{
          minWidth: 210,
          minHeight: 40,
          boxSizing: "border-box",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "6px 40px",
          backgroundColor: "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? (
          <>
            <span
              aria-hidden
              style={{
                width: 15,
                height: 15,
                boxSizing: "border-box",
                borderRadius: "50%",
                border: "2px solid white",
                borderTopColor: "transparent",
                animation: "toast-spin 0.7s linear infinite",
                display: "inline-block",
                flex: "none",
              }}
            />
            Loading…
          </>
        ) : (
          "Load data"
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={!loading}
        style={{
          minHeight: 40,
          boxSizing: "border-box",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px 40px",
          backgroundColor: loading ? "#ef4444" : "#fca5a5",
          color: "white",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: loading ? "pointer" : "not-allowed",
        }}
      >
        Cancel
      </button>
      {periodChanged && (
        <div
          style={{
            minHeight: 40,
            display: "flex",
            alignItems: "center",
            padding: "6px 10px",
            backgroundColor: "#fef3c7",
            border: "1px solid #fbbf24",
            borderRadius: 4,
            fontSize: 13,
            color: "#92400e",
          }}
        >
          ⚠️ Period changed, reload data
        </div>
      )}
    </div>
  );
}

export default function FiltersPanel({ loading = false, periodChanged = false, onLoad, onCancel }: FiltersPanelProps) {
  const indicatorUri = useIndicatorUri();
  const { schema } = useIndicatorSchema(indicatorUri);
  // Some schemas (e.g. gse) have no meaningful event type — hide that filter.
  const hideEventType = getSchemaPrimaryColumn(schema?.name) != null;

  return (
    <div
      className="filters-panel"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        gap: 8,
      }}
    >
      {/* upper section - no scroll: Period first, then Load/Cancel, then visualization */}
      <div style={{ padding: 12, paddingBottom: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <TimeFilter />
        {onLoad && onCancel && (
          <LoadControls
            loading={loading}
            periodChanged={periodChanged}
            onLoad={onLoad}
            onCancel={onCancel}
          />
        )}
        <VisualizationPicker />
      </div>

      {/* lower section - foldable filter sections, fills rest of space */}
      <div
        style={{
          padding: 12,
          paddingTop: 8,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflow: "auto",
        }}
      >
        {!hideEventType && <EventTypeFilter />}
        <PositionFilter />
        <DiscrepancyFilter />
        {/* Schema-driven per-column filters (collapsed by default). */}
        <ColumnFilters />
      </div>
    </div>
  );
}
