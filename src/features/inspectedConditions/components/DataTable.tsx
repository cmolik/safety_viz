import { useMemo,
   useState, 
   useEffect, 
} from "react";
import {
  useEvents,
  useSelectedTypeIds,
  useTimeFilter,
  useIndicatorUri,
  useDashboardStore,
  type GeoJSONFeature,
} from "@features/inspectedConditions/store/dashboard.store";
import { useEventFilter } from "@features/inspectedConditions/hooks/useEventFilter";
import { useIndicatorSchema } from "@features/inspectedConditions/hooks/useIndicatorSchema";
import { getSchemaPrimaryColumn } from "@features/inspectedConditions/utils/indicatorProfile";
import { formatCZ } from "@lib/date";

type SortKey = "type" | "date" | "lat" | "lon";
type SortDir = "asc" | "desc";

export function DataTableStatus() {

  return (
    <span style={{ fontSize: 12, color: "#4b5563" }}>
    </span>
  );
}

export default function DataTable() {
  const events = useEvents();
  const selectedIds = useSelectedTypeIds();
  const { preset, start, end } = useTimeFilter();
  const setData = useDashboardStore((s) => s.setData);
  const matchesFilters = useEventFilter({ undatedPasses: false, applyPosition: true });

  // Some schemas (e.g. gse) have no meaningful event type — the first column
  // shows a raw field (e.g. "Note") instead, and there's no type selection.
  const indicatorUri = useIndicatorUri();
  const { schema } = useIndicatorSchema(indicatorUri);
  const primary = getSchemaPrimaryColumn(schema?.name);
  const primaryLabel = primary?.label ?? "Type";
  const primaryOf = (f: GeoJSONFeature): string =>
    primary ? String(f.properties.raw?.[primary.field] ?? "") : (f.properties.name ?? "");

  const hasSelection = primary != null || (!!selectedIds && selectedIds.length > 0);

  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "type", dir: "asc" });
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null); // for Shift+click

  const rows = useMemo(() => {
    if (!hasSelection) return [];

    const base = (events ?? []).filter(matchesFilters);

    const dirMul = sort.dir === "asc" ? 1 : -1;
    const toNum = (v: unknown) => (typeof v === "number" ? v : Number(v));
    const toTime = (iso?: string) => new Date(iso ?? "").getTime();

    const sorted = [...base].sort((a, b) => {
      switch (sort.key) {
        case "type": {
          return primaryOf(a).localeCompare(primaryOf(b)) * dirMul;
        }
        case "date": {
          const A = toTime(a.properties.date);
          const B = toTime(b.properties.date);
          return (A - B) * dirMul;
        }
        case "lat": {
          const A = toNum(a.geometry?.coordinates?.[1] ?? 0);
          const B = toNum(b.geometry?.coordinates?.[1] ?? 0);
          return (A - B) * dirMul;
        }
        case "lon": {
          const A = toNum(a.geometry?.coordinates?.[0] ?? 0);
          const B = toNum(b.geometry?.coordinates?.[0] ?? 0);
          return (A - B) * dirMul;
        }
        default:
          return 0;
      }
    });

    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, matchesFilters, hasSelection, sort, primary]);

  // when order/filters change (and thus indexes), reset anchor
  useEffect(() => {
    setAnchorIndex(null);
  }, [sort, preset, start, end, selectedIds]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  // helpers for toggling highlighted
  const setHighlightedRange = (fromIdx: number, toIdx: number, value: boolean) => {
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    const ids = new Set(rows.slice(lo, hi + 1).map((r) => String(r.properties.id)));

    setData((d) => ({
      ...d,
      events: d.events.map((f) =>
        ids.has(String(f.properties.id)) ? { ...f, properties: { ...f.properties, highlighted: value } } : f
      ),
    }));
  };

  const toggleOneAtIndex = (idx: number) => {
    const row = rows[idx];
    const id = String(row.properties.id);
    const next = !row.properties.highlighted;
    setData((d) => ({
      ...d,
      events: d.events.map((f) =>
        String(f.properties.id) === id ? { ...f, properties: { ...f.properties, highlighted: next } } : f
      ),
    }));
  };

  const onRowClick = (e: React.MouseEvent, idx: number) => {
    const row = rows[idx];
    const next = !row.properties.highlighted;
    if (e.shiftKey && anchorIndex !== null) {
      setHighlightedRange(anchorIndex, idx, next);
    } else {
      toggleOneAtIndex(idx);
      setAnchorIndex(idx); // nastav novou kotvu
    }
  };

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : " ");

  return (
    <div className="table-container no-drag" style={{ height: "100%", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th onClick={() => toggleSort("type")}>{primaryLabel} {arrow("type")}</Th>
            <Th onClick={() => toggleSort("date")}>Date {arrow("date")}</Th>
            <Th onClick={() => toggleSort("lat")}>Latitude {arrow("lat")}</Th>
            <Th onClick={() => toggleSort("lon")}>Longitude {arrow("lon")}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => {
            const [lon, lat] = f.geometry?.coordinates ?? [0, 0];
            const isHighlighted = !!f.properties.highlighted;

            return (
              <tr
                key={String(f.properties.id)}
                className="no-drag"
                onMouseDown={onRowMouseDown}
                onClick={(e) => onRowClick(e, i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    // Consider shift key from keyboard (Shift+Enter/Space)
                    if (e.shiftKey && anchorIndex !== null) {
                      const next = !rows[i].properties.highlighted;
                      setHighlightedRange(anchorIndex, i, next);
                    } else {
                      toggleOneAtIndex(i);
                      setAnchorIndex(i);
                    }
                  }
                }}
                tabIndex={0}
                aria-selected={isHighlighted}
                style={{
                  background: isHighlighted ? "#fffa8b" : i % 2 ? "#f3f4f6" : "transparent",
                  cursor: "pointer",
                }}
              >
                <Td>{primaryOf(f) || "—"}</Td>
                <Td>{formatCZ(f.properties.date) || "—"}</Td>
                <Td>{Number.isFinite(lat) ? lat.toFixed(5) : "—"}</Td>
                <Td>{Number.isFinite(lon) ? lon.toFixed(5) : "—"}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* helper components for cell/header */
type ThProps = React.PropsWithChildren<{ onClick?: () => void }>;
function Th({ children, onClick }: ThProps) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: "left",
        borderBottom: "1px solid #e5e7eb",
        padding: "6px 8px",
        position: "sticky",
        top: 0,
        background: "#1f6b1f",
        color: "white",
        userSelect: "none",
        cursor: onClick ? "pointer" : "default",
      }}
      scope="col"
    >
      {children}
    </th>
  );
}

type TdProps = React.PropsWithChildren<React.TdHTMLAttributes<HTMLTableCellElement>>;
function Td({ children, style, ...rest }: TdProps) {
  return (
    <td {...rest} style={{ borderBottom: "1px solid #f3f4f6", padding: "6px 8px", ...style }}>
      {children}
    </td>
  );
}

const onRowMouseDown = (e: React.MouseEvent) => {
  if (e.shiftKey) e.preventDefault(); // prevent native text selection
};