import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useIndicatorsStore, detailHistoryKey } from "../store/indicators.store";
import ExperimentalChart from "./chart/ExperimentalChart";
import type { DailyData, DayStats, MonthStats, WeekStats } from "../types/dataTypes";
import { buildPeriodWindow } from "../utils/indicatorWindow";
import { applyValueMode } from "../utils/valueMode";
import {
  parseEndCeiling,
  isPartialEndMonth,
  isWithinEnd,
  buildChartHistory,
  capHistoryYears,
  buildChartData,
  buildRawByPeriod,
  buildTransposed,
  buildAllMonthsData,
  buildMonthStats,
} from "../utils/detailDerivations";
import { getIndicatorVariables } from "../api/indicators";
import { commentsByPeriod } from "../api/comments";
import CommentPopover from "./chart/CommentPopover";
import type { CommentAnchor } from "./chart/CommentPopover";
import TabButton from "./detail/TabButton";
import RelatedIndicatorsTab from "./detail/RelatedIndicatorsTab";
import ControlStructureTab from "./detail/ControlStructureTab";
import TransposedDataTable from "./detail/TransposedDataTable";
import { ApiClient } from "@core/api/http";
import { API_URL, BASENAME } from "@config/envMerge";
import { isoMonthStart, isoMonthEnd } from "@lib/period";

type Tab = "data" | "chart" | "control_structure";

// Max look-ahead months the chart can shift forward (window stays 12 wide).
const MAX_LOOK_AHEAD = 11;

export default function DetailPanel() {
  // The active detail tab lives in the URL (`?detailTab=…`) so Back/Forward
  // restores it along with the selected indicator and period.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("detailTab");
  const activeTab: Tab = rawTab === "data" || rawTab === "control_structure" ? rawTab : "chart";
  const setActiveTab = useCallback((tab: Tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("detailTab", tab);
      return next;
    });
  }, [setSearchParams]);
  const {
    indicatorData,
    historicalData,
    detailHistory,
    historyYears,
    setHistoryYears,
    // Months to look ahead (0–11): shifts the chart window forward to preview
    // upcoming months' historical sub-graphs. Kept in the store so it persists
    // across selecting / deselecting / switching indicators.
    lookAhead,
    setLookAhead,
    selectedIndicatorUri,
    getSelectedIndicatorData,
    getSelectedHistoricalData,
    getSelectedIndicator,
    getStpaDiagramForIndicator,
    getStpaInteractionsForIndicator,
    fetchHistoricalData,
    fetchDetailHistory,
    fetchComments,
    getSelectedIndicatorComments,
    saveComment,
    deleteComment,
    filters,
    appliedFilters,
    valueMode,
  } = useIndicatorsStore();

  const rawSelectedIndicatorData = getSelectedIndicatorData();
  const rawSelectedHistoricalData = getSelectedHistoricalData();
  const selectedIndicator = getSelectedIndicator();
  const selectedIndicatorComments = getSelectedIndicatorComments();
  const stpaDiagram = getStpaDiagramForIndicator();
  const stpaInteractions = getStpaInteractionsForIndicator();
  const hasData = Object.keys(indicatorData).length > 0;

  // Period ceiling from the applied end date: exclude anything after the end
  // month. Uses appliedFilters (the state the data was loaded for) so the chart
  // doesn't shift while the user edits filters before pressing Apply.
  const endCeiling = useMemo(() => parseEndCeiling(appliedFilters.endDate), [appliedFilters.endDate]);

  // The final month's column is drawn half-width when the applied end date is a
  // specific day before month end and isn't rounded up (matches the indicator list chart).
  const isPartialLastMonth = useMemo(
    () => isPartialEndMonth(appliedFilters.endDate, appliedFilters.roundEndDate),
    [appliedFilters.endDate, appliedFilters.roundEndDate]
  );

  // Month/Float/Fixed is applied before anything else reads the series, so the
  // value line, the aligned table and the STPA highlight colour all agree. The
  // warmed history supplies the months an average reaches back into.
  const selectedIndicatorData = useMemo(() => {
    if (!rawSelectedIndicatorData) return null;
    const modeData = applyValueMode(
      rawSelectedIndicatorData,
      rawSelectedHistoricalData ?? undefined,
      valueMode,
    );
    return modeData.filter(p => isWithinEnd(p.period, endCeiling));
  }, [rawSelectedIndicatorData, rawSelectedHistoricalData, valueMode, endCeiling]);

  // Look-ahead history: when looking ahead, prefer the detail-scoped history
  // fetched with the extended end (keyed to this exact view); otherwise fall back
  // to the warmed per-indicator history, which already holds the prior-year data.
  const detailHistoryData = useMemo(() => {
    if (lookAhead === 0 || !detailHistory || !selectedIndicatorUri || !filters.endDate) return null;
    const key = detailHistoryKey(selectedIndicatorUri, lookAhead, historyYears, filters.endDate, filters.roundEndDate);
    return detailHistory.key === key ? detailHistory.data : null;
  }, [lookAhead, detailHistory, selectedIndicatorUri, filters.endDate, filters.roundEndDate, historyYears]);

  // The history is its own look-back source, with the loaded 12-month window
  // overlaid as the authoritative copy of the months it covers (see
  // buildChartHistory for why the overlay matters for the edge month).
  const rawChartHistory = useMemo(
    () => buildChartHistory(detailHistoryData ?? rawSelectedHistoricalData, rawSelectedIndicatorData, valueMode),
    [detailHistoryData, rawSelectedHistoricalData, rawSelectedIndicatorData, valueMode]
  );

  // Historical band/subgraphs: after the end ceiling, keep only the most recent
  // `historyYears` years per month so every month shows the same count.
  const selectedHistoricalData = useMemo(
    () => (rawChartHistory ? capHistoryYears(rawChartHistory, endCeiling, historyYears) : null),
    [rawChartHistory, endCeiling, historyYears]
  );

  // API client for background historical data fetching
  const api = useMemo(() => new ApiClient({
    baseUrl: API_URL,
  }), []);

  // Fetch this indicator's history on demand when selected. Safe to call even
  // while the background prefetch runs: the store action skips it if already
  // cached or in flight, so selection stays instant and never double-fetches.
  useEffect(() => {
    if (selectedIndicatorUri && hasData && !historicalData[selectedIndicatorUri]) {
      fetchHistoricalData(api, selectedIndicatorUri);
    }
  }, [selectedIndicatorUri, hasData, historicalData, fetchHistoricalData, api]);

  // When looking ahead, lazily fetch the selected indicator's history with the
  // end extended by N months. The store dedupes by (uri, lookAhead, historyYears,
  // period), so this is a no-op once loaded. Until it lands, the chart falls back
  // to the warmed history (which already holds the look-ahead months' prior years).
  useEffect(() => {
    if (lookAhead > 0 && selectedIndicatorUri && hasData) {
      fetchDetailHistory(api, selectedIndicatorUri, lookAhead);
    }
  }, [lookAhead, selectedIndicatorUri, hasData, historyYears, fetchDetailHistory, api]);

  // Comments for the subgraphs. The store loads every indicator's comments for
  // the chart's date range in one request and caches them by range, so this only
  // fetches when the range changes — not on every selection. historyYears and
  // lookAhead are deps because the store derives that range from them.
  useEffect(() => {
    if (hasData && filters.endDate) fetchComments(api);
  }, [hasData, filters.endDate, historyYears, lookAhead, fetchComments, api]);

  // The selected indicator's comments, grouped by period so the subgraph dots
  // can flag & tooltip them.
  const comments = useMemo(
    () => commentsByPeriod(selectedIndicatorComments),
    [selectedIndicatorComments],
  );

  // The (year, month) cell whose comment editor is open, and where it was
  // opened from. Closed on indicator switch so it can't outlive its subject.
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
  useEffect(() => { setCommentAnchor(null); }, [selectedIndicatorUri]);

  const openComments = useCallback((periodKey: string, clientX: number, clientY: number) => {
    const [year, month] = periodKey.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;
    setCommentAnchor({ year, month, x: clientX, y: clientY });
  }, []);

  // Transform indicator overview data for chart (DailyData format)
  // The chart window: 12 month-columns shifted forward by `lookAhead`. The
  // selected end month sits at column (12 - lookAhead); the last `lookAhead`
  // columns are upcoming months shown with their historical sub-graphs only.
  const periodWindow = useMemo(() => {
    if (!selectedIndicatorData || selectedIndicatorData.length === 0) return null;
    return buildPeriodWindow(selectedIndicatorData, appliedFilters.endDate, lookAhead);
  }, [selectedIndicatorData, appliedFilters.endDate, lookAhead]);

  // Columns holding actual (<= selected date) data; the rest are look-ahead.
  const actualCount = periodWindow?.actualCount ?? 0;

  const chartData = useMemo((): DailyData[] => (periodWindow ? buildChartData(periodWindow) : []), [periodWindow]);

  // Raw (mode-independent) monthly findings/movements keyed by "YYYY-M". The
  // per-month rows always show the single month's figures, even in Float/Fixed
  // where the mode-applied slots instead carry the window's summed inputs.
  const rawByPeriod = useMemo(() => buildRawByPeriod(rawSelectedIndicatorData), [rawSelectedIndicatorData]);

  // Transposed (month-as-column) view of the data, aligned with the chart.
  const transposed = useMemo(
    () => (periodWindow ? buildTransposed(periodWindow, rawByPeriod) : null),
    [periodWindow, rawByPeriod]
  );

  // The normalization constant is per-indicator, not per-month, so it belongs in
  // the table's header rather than repeated across every column. Prefer the raw
  // monthly unit; fall back to the mode-applied one (which defaults it to 1).
  const unitValue = useMemo(() => {
    const fromRaw = (rawSelectedIndicatorData ?? []).find(p => p.unit != null)?.unit;
    if (fromRaw != null) return fromRaw;
    return selectedIndicatorData?.find(p => p.unit != null)?.unit ?? null;
  }, [rawSelectedIndicatorData, selectedIndicatorData]);

  // The indicator's real formula variables — the numerator / denominator rows
  // are labelled with these names (e.g. "inspections", "occurrences") instead of
  // the generic Findings / Mvmt, and the constant is named in the header.
  const vars = useMemo(
    () => (selectedIndicator ? getIndicatorVariables(selectedIndicator) : null),
    [selectedIndicator]
  );
  // Human formula for the header, e.g. "constant × occurrences / movements".
  const prettyFormula = selectedIndicator?.formula
    ? selectedIndicator.formula.replace(/\*/g, " × ").replace(/\//g, " / ")
    : null;

  // Thresholds are constant per indicator (the indicator's fallback redline/
  // greenline). Fill all 12 columns so the chart draws the reference lines across
  // every month, including the look-ahead columns, and the sub-graphs keep them too.
  const { redlineConst, greenlineConst } = useMemo(() => ({
    redlineConst: selectedIndicatorData?.find(p => p.redline != null)?.redline ?? null,
    greenlineConst: selectedIndicatorData?.find(p => p.greenline != null)?.greenline ?? null,
  }), [selectedIndicatorData]);

  const redlineValues = useMemo((): (number | null)[] =>
    periodWindow ? periodWindow.periods.map(() => redlineConst) : [],
    [periodWindow, redlineConst]);

  const greenlineValues = useMemo((): (number | null)[] =>
    periodWindow ? periodWindow.periods.map(() => greenlineConst) : [],
    [periodWindow, greenlineConst]);

  // Subgraph data for every column (incl. look-ahead), grouped by calendar month.
  const allMonthsData = useMemo(
    () => (periodWindow ? buildAllMonthsData(periodWindow, selectedHistoricalData) : []),
    [periodWindow, selectedHistoricalData]
  );

  // The overview endpoint no longer returns per-period min/max, so the
  // historical min/max band has no data source.
  const dayStats: DayStats = useMemo(() => ({}), []);

  // Compute monthStats from real historical data (keyed as "YYYY-M" -> { count })
  const monthStats = useMemo((): MonthStats => buildMonthStats(selectedHistoricalData), [selectedHistoricalData]);

  const weekStats: WeekStats = {};

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header with clear button */}
      {selectedIndicator && (
        <div style={{
          padding: "8px 12px",
          backgroundColor: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <h3 style={{ margin: 0, color: "#1f2937" }}>
              {selectedIndicator.id} - {selectedIndicator.title}
          </h3>
        </div>
      )}

      {/* Tabs — only shown once an indicator is selected. The tabs' own bottom
          borders form a continuous blue baseline; the active tab notches out of it. */}
      {selectedIndicator && (
        <div style={{
          display: "flex",
          gap: 0,
          alignItems: "flex-end",
          marginBottom: 16
        }}>
          <TabButton
            active={activeTab === "chart"}
            onClick={() => setActiveTab("chart")}
          >
            Data detail
          </TabButton>
          <TabButton
            active={activeTab === "data"}
            onClick={() => setActiveTab("data")}
          >
            Related indicators
          </TabButton>
          <TabButton
            active={activeTab === "control_structure"}
            onClick={() => setActiveTab("control_structure")}
          >
            STPA analysis
          </TabButton>
        </div>
      )}

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
        {!selectedIndicator ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#6b7280"
          }}>
            <p>Select an indicator from the list to view details</p>
          </div>
        ) : selectedIndicator && !hasData ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "#6b7280",
            textAlign: "center",
            padding: 16
          }}>
            <div style={{
              padding: 16,
              backgroundColor: "#fef3c7",
              border: "1px solid #fbbf24",
              borderRadius: 8,
              color: "#92400e"
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                No data loaded
              </div>
              <div style={{ fontSize: 14 }}>
                Set filters in the left panel and click "Load data" to load indicator data
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === "data" && (
              <RelatedIndicatorsTab selectedIndicator={selectedIndicator} />
            )}
            {activeTab === "chart" && (
              <div>
                {selectedIndicator && selectedIndicatorData && (
                  <>
                {/* Chart history controls */}
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#374151" }}>
                    Look-ahead (months):
                    <select
                      value={lookAhead}
                      onChange={(e) => setLookAhead(Number(e.target.value))}
                      style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13 }}
                    >
                      {Array.from({ length: MAX_LOOK_AHEAD + 1 }, (_, n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#374151" }}>
                    History (years):
                    <select
                      value={historyYears}
                      onChange={(e) => setHistoryYears(Number(e.target.value))}
                      style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13 }}
                    >
                      {[3, 4, 5].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      const params = new URLSearchParams();
                      params.set('indicatorUri', selectedIndicator.uri);
                      params.set('title', `${selectedIndicator.id} ${selectedIndicator.title}`);
                      if (filters.endDate) {
                        const [y, m] = filters.endDate.split('-').map(Number);
                        params.set('startDate', isoMonthStart(y, m));
                        params.set('endDate', isoMonthEnd(y, m));
                      }
                      const url = `${window.location.origin}${BASENAME}/inspectedConditions?${params.toString()}`;
                      window.open(url, '_blank');
                    }}
                    style={{
                      marginLeft: "auto", // push the button to the right, labels stay left
                      padding: "6px 14px",
                      backgroundColor: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Show on map
                  </button>
                </div>

                {chartData.length === 0 ? (
                  <div style={{
                    height: 300,
                    backgroundColor: "#f9fafb",
                    border: "2px dashed #d1d5db",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6b7280"
                  }}>
                    <p>No data available for chart</p>
                  </div>
                ) : (
                  <div style={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "0px 16px 0px"
                  }}>
                    <ExperimentalChart
                      filteredData={chartData}
                      allData={chartData}
                      granulation="month"
                      currentStartDate={chartData[0]?.date || ""}
                      margin={{ top: 70, right: 20, bottom: 30, left: 40 }}
                      dayStats={dayStats}
                      monthStats={monthStats}
                      weekStats={weekStats}
                      showSubgraphs={true}
                      allMonthsData={allMonthsData}
                      redlineValues={redlineValues}
                      greenlineValues={greenlineValues}
                      isPartialLastMonth={isPartialLastMonth}
                      actualCount={actualCount}
                      comments={comments}
                      onOpenComments={selectedIndicatorUri ? openComments : undefined}
                    />
                  </div>
                )}

                {transposed && (
                  <TransposedDataTable
                    transposed={transposed}
                    valueMode={valueMode}
                    showRedline={filters.redline}
                    showGreenline={filters.greenline}
                    prettyFormula={prettyFormula}
                    vars={vars}
                    unitValue={unitValue}
                  />
                )}

                  </>
                )}
              </div>
            )}
            {activeTab === "control_structure" && (
              <ControlStructureTab
                stpaDiagram={stpaDiagram}
                stpaInteractions={stpaInteractions}
                selectedIndicator={selectedIndicator}
                selectedIndicatorData={selectedIndicatorData}
              />
            )}
          </>
        )}
      </div>

      {/* Comment editor for the clicked (year, month) cell. Portals to body, so
          it renders above the panel regardless of where it sits in the grid. */}
      {commentAnchor && selectedIndicatorUri && (
        <CommentPopover
          anchor={commentAnchor}
          indicatorUri={selectedIndicatorUri}
          indicatorTitle={selectedIndicator?.title || selectedIndicatorUri}
          comments={comments.get(`${commentAnchor.year}-${commentAnchor.month}`) ?? []}
          onSave={(input) => saveComment(api, input)}
          onDelete={(uri) => deleteComment(api, uri)}
          onClose={() => setCommentAnchor(null)}
        />
      )}
    </div>
  );
}
