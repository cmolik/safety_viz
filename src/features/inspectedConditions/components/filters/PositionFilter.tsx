import {
  useDashboardStore,
  useWithPosition,
  useIncludeWithoutPosition,
  useHasGeometry,
} from "../../store/dashboard.store";
import FilterSection, { ActiveBadge } from "./FilterSection";

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  cursor: "pointer",
};

/**
 * Position filter: two independent toggles for rows that have a location and
 * rows that don't. Only meaningful when the dataset carries geometry, so the
 * whole section hides otherwise.
 */
export default function PositionFilter() {
  const hasGeometry = useHasGeometry();
  const withPosition = useWithPosition();
  const includeWithoutPosition = useIncludeWithoutPosition();
  const setWithPosition = useDashboardStore((s) => s.setWithPosition);
  const setIncludeWithoutPosition = useDashboardStore((s) => s.setIncludeWithoutPosition);

  if (!hasGeometry) return null;

  // Default state (with only) is neutral; anything else is actively narrowing.
  const label =
    withPosition && includeWithoutPosition
      ? "all"
      : withPosition
      ? "with"
      : includeWithoutPosition
      ? "without"
      : "none";
  const active = !(withPosition && !includeWithoutPosition);

  return (
    <FilterSection
      title="Position"
      badge={<ActiveBadge tone={active ? "active" : "muted"}>{label}</ActiveBadge>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={withPosition}
            onChange={(e) => setWithPosition(e.target.checked)}
          />
          With position
        </label>
        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={includeWithoutPosition}
            onChange={(e) => setIncludeWithoutPosition(e.target.checked)}
          />
          Without position
        </label>
      </div>
    </FilterSection>
  );
}
