import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useIndicatorsStore } from "../store/indicators.store";
import IndicatorLineChart from "./IndicatorLineChart";
import { useSelectIndicator } from "../hooks/useIndicatorSelection";
import type { IndicatorMetadata, IndicatorOverviewDataPoint } from "../api/indicators";
import { getIndicatorStatus, getWorstCategory, tabCategoryColors, type ValueCategory } from "../utils/indicatorStatus";
import { shouldUseLineChartVisualization } from "../utils/presentationType";
import { buildIndicatorTree } from "../utils/indicatorTree";
import { applyValueMode } from "../utils/valueMode";
import { getTabFilterCriteria, filterIndicatorsByCriteria, type ListTab as Tab } from "../utils/indicatorTabs";

const INDENT_PX = 24;

// Layered box-shadow that makes a card look like a stack of 3 offset rectangles,
// signalling that the indicator has folded sub-indicators nested underneath it.
// Each layer is a white fill (spread -1) sitting on a colored rim (spread 0);
// the rim is highlighted (blue) when a folded parent is selected.
const stackShadow = (rim: string) =>
  `3px 3px 0 -1px #ffffff, 3px 3px 0 0 ${rim}, 6px 6px 0 -1px #ffffff, 6px 6px 0 0 ${rim}`;

// Same 4-layer structure with zero offset and transparent colors, so the card's
// `transition` interpolates the stack folding back into the card when unfolded.
const STACK_HIDDEN =
  "0 0 0 -1px transparent, 0 0 0 0 transparent, 0 0 0 -1px transparent, 0 0 0 0 transparent";

// A tab draws a blinking "!" badge when its worst indicator is warning or danger.
const isAlertStatus = (s: ValueCategory) => s === "danger" || s === "warning";

type IndicatorListPanelProps = {
  /** Right-click "Load this month" on a line-chart month -> load that year/month. */
  onLoadMonth?: (year: number, month: number) => void;
};

export default function IndicatorListPanel({ onLoadMonth }: IndicatorListPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("importance_100+");
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // The status each tab was acknowledged at (by clicking it). A tab keeps
  // blinking a "!" until the user clicks it at its current alert status — so a
  // later escalation (e.g. warning -> danger) makes it blink again.
  const [ackStatus, setAckStatus] = useState<Partial<Record<Tab, ValueCategory>>>({});
  const {
    indicatorMetadata,
    indicatorData,
    historicalData,
    valueMode,
    metadataLoading,
    loading,
    selectedIndicatorUri,
    appliedFilters,
  } = useIndicatorsStore();

  const selectIndicator = useSelectIndicator();

  // Month/Float/Fixed applied once for every indicator, so the rows, their bar
  // charts and the tab status colors all read the same series. The warmed
  // history supplies the look-back months Float/Fixed need before the start of
  // the loaded 12-month window.
  const modeData = useMemo(() => {
    if (valueMode === "month") return indicatorData;
    const derived: Record<string, IndicatorOverviewDataPoint[]> = {};
    for (const [uri, data] of Object.entries(indicatorData)) {
      derived[uri] = applyValueMode(data, historicalData[uri], valueMode);
    }
    return derived;
  }, [indicatorData, historicalData, valueMode]);

  const indicatorRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Each completed data load re-arms every tab's "!" so a still-alert tab (e.g.
  // yellow before and after the load) blinks again until it is re-acknowledged.
  const prevLoadingRef = useRef(loading);
  useEffect(() => {
    if (prevLoadingRef.current && !loading) setAckStatus({});
    prevLoadingRef.current = loading;
  }, [loading]);

  const tree = useMemo(() => buildIndicatorTree(indicatorMetadata), [indicatorMetadata]);

  const indicatorByUri = useMemo(() => {
    const m = new Map<string, IndicatorMetadata>();
    for (const ind of indicatorMetadata) m.set(ind.uri, ind);
    return m;
  }, [indicatorMetadata]);

  // When search matches a child, surface its ancestors so the child has somewhere to nest.
  const filteredIndicators = useMemo(() => {
    if (!searchQuery) return indicatorMetadata;
    const query = searchQuery.toLowerCase();
    const directMatches = indicatorMetadata.filter(indicator =>
      indicator.title.toLowerCase().includes(query) ||
      indicator.id.toLowerCase().includes(query) ||
      indicator.uri.toLowerCase().includes(query)
    );
    const includedUris = new Set<string>(directMatches.map(i => i.uri));
    for (const m of directMatches) {
      for (const anc of tree.ancestorsOf(m.uri)) includedUris.add(anc);
    }
    return indicatorMetadata.filter(i => includedUris.has(i.uri));
  }, [indicatorMetadata, searchQuery, tree]);

  const sortedIndicators = useMemo(() => {
    return [...filteredIndicators].sort((a, b) => a.order - b.order);
  }, [filteredIndicators]);

  // Top-level indicators only — children render under their parent regardless of tab.
  const topLevelOf = useCallback(
    (list: IndicatorMetadata[]) => list.filter(i => !tree.parentByChild.has(i.uri)),
    [tree]
  );

  const importance100Plus = useMemo(() =>
    topLevelOf(filterIndicatorsByCriteria(sortedIndicators, getTabFilterCriteria("importance_100+"))),
    [sortedIndicators, topLevelOf]
  );

  const importance90To99 = useMemo(() =>
    topLevelOf(filterIndicatorsByCriteria(sortedIndicators, getTabFilterCriteria("importance_90-99"))),
    [sortedIndicators, topLevelOf]
  );

  const importance50To89 = useMemo(() =>
    topLevelOf(filterIndicatorsByCriteria(sortedIndicators, getTabFilterCriteria("importance_50-89"))),
    [sortedIndicators, topLevelOf]
  );

  const importance0To49 = useMemo(() =>
    topLevelOf(filterIndicatorsByCriteria(sortedIndicators, getTabFilterCriteria("importance_0-49"))),
    [sortedIndicators, topLevelOf]
  );

  // Tab status reflects all indicators matching the tab criteria, regardless of nesting visibility.
  const calculateTabStatus = useMemo(() => (tab: Tab) => {
    const criteria = getTabFilterCriteria(tab);
    const indicators = filterIndicatorsByCriteria(indicatorMetadata, criteria);

    if (indicators.length === 0) return "unknown";
    if (loading) return "unknown";

    const statuses = indicators.map(indicator => {
      const data = modeData[indicator.uri] || [];
      return getIndicatorStatus(data, appliedFilters.endDate);
    });
    return getWorstCategory(statuses);
  }, [indicatorMetadata, modeData, loading, appliedFilters.endDate]);

  const importance100PlusStatus = useMemo(() => calculateTabStatus("importance_100+"), [calculateTabStatus]);
  const importance90To99Status = useMemo(() => calculateTabStatus("importance_90-99"), [calculateTabStatus]);
  const importance50To89Status = useMemo(() => calculateTabStatus("importance_50-89"), [calculateTabStatus]);
  const importance0To49Status = useMemo(() => calculateTabStatus("importance_0-49"), [calculateTabStatus]);

  const currentTopLevel = useMemo(() => {
    switch (activeTab) {
      case "importance_100+": return importance100Plus;
      case "importance_90-99": return importance90To99;
      case "importance_50-89": return importance50To89;
      case "importance_0-49": return importance0To49;
      default: return importance100Plus;
    }
  }, [activeTab, importance100Plus, importance90To99, importance50To89, importance0To49]);

  // Auto-expand ancestors of the selected indicator and any direct search matches.
  useEffect(() => {
    const toExpand = new Set<string>();
    if (selectedIndicatorUri) {
      for (const anc of tree.ancestorsOf(selectedIndicatorUri)) toExpand.add(anc);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      for (const m of indicatorMetadata) {
        const matches =
          m.title.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query) ||
          m.uri.toLowerCase().includes(query);
        if (matches) {
          for (const anc of tree.ancestorsOf(m.uri)) toExpand.add(anc);
        }
      }
    }
    if (toExpand.size === 0) return;
    setExpanded(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const u of toExpand) {
        if (!next.has(u)) {
          next.add(u);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedIndicatorUri, searchQuery, tree, indicatorMetadata]);

  // Switch tab so the rendering ancestor of the selected indicator is visible.
  useEffect(() => {
    if (!selectedIndicatorUri) return;

    const renderingUri = tree.rootAncestorUri(selectedIndicatorUri);
    const renderingIndicator = indicatorByUri.get(renderingUri);
    if (!renderingIndicator) return;

    let targetTab: Tab | null = null;
    for (const tab of ["importance_100+", "importance_90-99", "importance_50-89", "importance_0-49"] as Tab[]) {
      const criteria = getTabFilterCriteria(tab);
      const belongsToTab =
        renderingIndicator.importance >= criteria.importanceMin &&
        renderingIndicator.importance < criteria.importanceMax &&
        renderingIndicator.types.includes(criteria.type);
      if (belongsToTab) {
        targetTab = tab;
        break;
      }
    }
    if (targetTab) setActiveTab(targetTab);
  }, [selectedIndicatorUri, indicatorByUri, tree]);

  useEffect(() => {
    if (!selectedIndicatorUri) return;
    const timeoutId = setTimeout(() => {
      const element = indicatorRefs.current.get(selectedIndicatorUri);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [selectedIndicatorUri, activeTab, expanded]);

  const toggleExpanded = (uri: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  };

  // Recursive render. Returns a flat array of nodes plus a count of rendered rows.
  const renderTree = (uris: string[], depth: number): { nodes: React.ReactNode[]; count: number } => {
    const nodes: React.ReactNode[] = [];
    let count = 0;
    for (const uri of uris) {
      const indicator = indicatorByUri.get(uri);
      if (!indicator) continue;
      const childUris = tree.childrenByParent.get(uri) ?? [];
      const visibleChildUris =
        searchQuery
          ? childUris.filter(c => filteredIndicators.some(f => f.uri === c))
          : childUris;
      const isExpanded = expanded.has(uri);

      nodes.push(
        <IndicatorRow
          key={uri}
          indicator={indicator}
          depth={depth}
          hasChildren={visibleChildUris.length > 0}
          isExpanded={isExpanded}
          isSelected={selectedIndicatorUri === uri}
          data={modeData[uri] || []}
          onToggleExpand={() => toggleExpanded(uri)}
          onSelect={() => selectIndicator(selectedIndicatorUri === uri ? null : uri)}
          onLoadMonth={onLoadMonth}
          registerRef={(el) => {
            if (el) indicatorRefs.current.set(uri, el);
            else indicatorRefs.current.delete(uri);
          }}
        />
      );
      count += 1;

      if (isExpanded && visibleChildUris.length > 0) {
        const childResult = renderTree(visibleChildUris, depth + 1);
        nodes.push(...childResult.nodes);
        count += childResult.count;
      }
    }
    return { nodes, count };
  };

  const rendered = renderTree(currentTopLevel.map(i => i.uri), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tabs — the tabs' own bottom borders form one continuous blue baseline
          across the panel (gap 0 keeps it unbroken); the active tab leaves a
          notch in it so it reads as connected to the content. */}
      <div style={{
        display: "flex",
        gap: 0,
        alignItems: "flex-end",
        marginBottom: 16
      }}>
        {([
          { id: "importance_100+", label: "Main reactive indicators", status: importance100PlusStatus },
          { id: "importance_90-99", label: "Other reactive indicators", status: importance90To99Status },
          { id: "importance_50-89", label: "Main system indicators", status: importance50To89Status },
          { id: "importance_0-49", label: "Other system indicators", status: importance0To49Status },
        ] as { id: Tab; label: string; status: ValueCategory }[]).map((t) => (
          <TabButton
            key={t.id}
            active={activeTab === t.id}
            onClick={() => {
              // Switching to a different indicator group clears the current
              // selection, so the detail panel empties out.
              if (activeTab !== t.id) selectIndicator(null);
              setActiveTab(t.id);
              // Clicking the tab acknowledges its current status, stopping the blink.
              setAckStatus((prev) => ({ ...prev, [t.id]: t.status }));
            }}
            statusColor={tabCategoryColors[t.status]}
            needsAttention={isAlertStatus(t.status) && ackStatus[t.id] !== t.status}
          >
            {t.label}
          </TabButton>
        ))}
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: 16, padding: "0 8px" }}>
        <input
          type="text"
          placeholder="Search indicators by ID, title, or URI..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 4,
            fontSize: 14
          }}
        />
      </div>

      {/* Loading State */}
      {metadataLoading && (
        <div style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
          <p>Loading indicators...</p>
        </div>
      )}

      {/* Empty State */}
      {!metadataLoading && indicatorMetadata.length === 0 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 16,
          textAlign: "center"
        }}>
          <div style={{
            padding: 16,
            backgroundColor: "#f3f4f6",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            color: "#6b7280"
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              No indicators loaded
            </div>
            <div style={{ fontSize: 14 }}>
              Set filters in the left panel and click "Load data" to load indicators
            </div>
          </div>
        </div>
      )}

      {/* Indicator List */}
      {!metadataLoading && indicatorMetadata.length > 0 && (
        <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
          {currentTopLevel.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
              <p>No indicators found in this importance range</p>
              {searchQuery && (
                <p style={{ fontSize: 14 }}>
                  Try adjusting your search query
                </p>
              )}
            </div>
          ) : (
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              // Extra right/bottom room so the stacked-list shadow of parent
              // indicators isn't crammed against the panel border.
              paddingRight: 10,
              paddingBottom: 8,
            }}>
              {rendered.nodes}
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      {/* {!metadataLoading && rendered.count > 0 && (
        <div style={{
          padding: "12px 8px",
          borderTop: "1px solid #e5e7eb",
          fontSize: 13,
          color: "#6b7280",
          textAlign: "center"
        }}>
          Showing {rendered.count} indicator{rendered.count !== 1 ? 's' : ''}
          {searchQuery && ` (filtered)`}
        </div>
      )} */}
    </div>
  );
}

type IndicatorRowProps = {
  indicator: IndicatorMetadata;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  data: IndicatorOverviewDataPoint[];
  onToggleExpand: () => void;
  onSelect: () => void;
  onLoadMonth?: (year: number, month: number) => void;
  registerRef: (el: HTMLDivElement | null) => void;
};

function IndicatorRow({
  indicator,
  depth,
  hasChildren,
  isExpanded,
  isSelected,
  data,
  onToggleExpand,
  onSelect,
  onLoadMonth,
  registerRef,
}: IndicatorRowProps) {
  const useLineChart = shouldUseLineChartVisualization(indicator);
  const hasData = data.length > 0;
  const showLineChart = useLineChart && hasData;

  const containerStyle: React.CSSProperties = {
    paddingLeft: depth * INDENT_PX,
    display: "flex",
    alignItems: "stretch",
    gap: 4,
  };

  // The fold/unfold chevron now lives inside the card, at the start of the
  // chart row (or the fallback row), rather than as a separate outer column.
  const chevron = (
    <ChevronColumn
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      onClick={(e) => {
        e.stopPropagation();
        onToggleExpand();
        // Selecting on expand too — but don't let a click on the arrow of an
        // already-selected indicator toggle it back off.
        if (!isSelected) onSelect();
      }}
    />
  );

  return (
    <div style={containerStyle} className={depth > 0 ? "indicator-child-row" : undefined}>
      <div
        ref={registerRef}
        onClick={onSelect}
        style={{
          flex: 1,
          minWidth: 0,
          padding: showLineChart ? "8px 12px" : "12px 16px",
          backgroundColor: isSelected ? "#dbeafe" : "white",
          border: `2px solid ${isSelected ? "#3b82f6" : "#e5e7eb"}`,
          borderRadius: 8,
          cursor: "pointer",
          transition: "all 0.2s",
          // A folded parent shows the stacked-rectangles look; unfolding hides it
          // (the shadow folds back into the card via the transition). When a
          // folded parent is selected, the stack rims are highlighted blue.
          boxShadow: hasChildren
            ? (isExpanded ? STACK_HIDDEN : stackShadow(isSelected ? "#3b82f6" : "#d1d5db"))
            : undefined,
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = "#f3f4f6";
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = "white";
          }
        }}
      >
        {showLineChart ? (
          <IndicatorLineChart indicator={indicator} data={data} leadingSlot={chevron} onLoadMonth={onLoadMonth} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {chevron}
            <div style={{
              backgroundColor: isSelected ? "#3b82f6" : "#6b7280",
              color: "white",
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              minWidth: 60,
              textAlign: "center",
              flexShrink: 0
            }}>
              {indicator.id}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600,
                color: isSelected ? "#1e40af" : "#1f2937",
                marginBottom: 4,
                fontSize: 14,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical"
              }}>
                {indicator.title}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronColumn({
  hasChildren,
  isExpanded,
  onClick,
}: {
  hasChildren: boolean;
  isExpanded: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (!hasChildren) {
    return <div style={{ width: 24, flexShrink: 0 }} aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isExpanded ? "Collapse" : "Expand"}
      // Full-height, wider hit area for an easier click; a subtle rounded hover
      // background makes the target discoverable.
      style={{
        width: 24,
        flexShrink: 0,
        alignSelf: "stretch",
        minHeight: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        color: "#6b7280",
        fontSize: 12,
        padding: 0,
        userSelect: "none",
        transition: "background-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {/* Single triangle rotated 90° when expanded, so it animates both ways. */}
      <span style={{
        display: "inline-block",
        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}>
        ▶
      </span>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  statusColor,
  needsAttention,
  children
}: {
  active: boolean;
  onClick: () => void;
  statusColor: string;
  needsAttention: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        // Only the height differs: the active tab is taller. Only the TOP padding
        // changes (bottom stays 8px) so the tab grows purely upward and its bottom
        // edge never shifts — no 1px jitter on the bottom line during the switch.
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: active ? "13px 8px 8px" : "8px",
        backgroundColor: statusColor,
        color: "#1f2937",
        fontSize: 12,
        fontWeight: active ? 700 : 600,
        cursor: "pointer",
        // The becoming-active tab grows immediately; the deselected tab delays its
        // shrink until the grow finishes, so the tab bar never dips (no pop).
        transition: `border-color 0.15s, opacity 0.15s, box-shadow 0.15s, padding 0.15s ${active ? "0s" : "0.15s"}`,
        // Blue outline that forms one continuous line across the panel: inactive
        // tabs contribute only a blue bottom border (the baseline), the active tab
        // is outlined on top/left/right with an OPEN (transparent) bottom, so its
        // sides merge into the baseline while its bottom notches out of it.
        borderStyle: "solid",
        borderWidth: 2,
        borderTopColor: active ? "#3b82f6" : "transparent",
        borderLeftColor: active ? "#3b82f6" : "transparent",
        borderRightColor: active ? "#3b82f6" : "transparent",
        borderBottomColor: active ? "transparent" : "#3b82f6",
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        opacity: active ? 1 : 0.85,
        boxShadow: active ? "0 -1px 4px rgba(0,0,0,0.12)" : "none",
      }}
    >
      {needsAttention && (
        <span
          className="tab-alert"
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 15,
            color: "#111827",
            fontSize: 16,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          !
        </span>
      )}
      {children}
    </button>
  );
}
