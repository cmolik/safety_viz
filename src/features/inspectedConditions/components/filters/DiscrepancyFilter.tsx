import {
  useDashboardStore,
  useShowDiscrepancy,
  useShowNonDiscrepancy,
  useIndicatorUri,
} from "../../store/dashboard.store";
import { getDiscrepancyPredicate } from "../../utils/indicatorProfile";
import { useIndicatorSchema } from "../../hooks/useIndicatorSchema";
import FilterSection, { ActiveBadge } from "./FilterSection";

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  cursor: "pointer",
};

/**
 * Discrepancy filter: two independent toggles for rows that are / aren't a
 * discrepancy. "Discrepancy" is defined per-indicator (see `indicatorProfile`),
 * so the section hides for indicators that have no discrepancy concept.
 */
export default function DiscrepancyFilter() {
  const indicatorUri = useIndicatorUri();
  const { schema } = useIndicatorSchema(indicatorUri);
  const showDiscrepancy = useShowDiscrepancy();
  const showNonDiscrepancy = useShowNonDiscrepancy();
  const setShowDiscrepancy = useDashboardStore((s) => s.setShowDiscrepancy);
  const setShowNonDiscrepancy = useDashboardStore((s) => s.setShowNonDiscrepancy);

  if (getDiscrepancyPredicate(schema?.name) == null) return null;

  // Default state (both on) is neutral; anything else is actively narrowing.
  const label =
    showDiscrepancy && showNonDiscrepancy
      ? "all"
      : showDiscrepancy
      ? "yes"
      : showNonDiscrepancy
      ? "no"
      : "none";
  const active = !(showDiscrepancy && showNonDiscrepancy);

  return (
    <FilterSection
      title="Discrepancy"
      badge={<ActiveBadge tone={active ? "active" : "muted"}>{label}</ActiveBadge>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={showDiscrepancy}
            onChange={(e) => setShowDiscrepancy(e.target.checked)}
          />
          Discrepancy
        </label>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={showNonDiscrepancy}
            onChange={(e) => setShowNonDiscrepancy(e.target.checked)}
          />
          Not a discrepancy
        </label>
      </div>
    </FilterSection>
  );
}
