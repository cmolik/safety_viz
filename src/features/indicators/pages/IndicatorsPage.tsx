import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigationType, useSearchParams } from "react-router-dom";
import { Responsive, WidthProvider, type Layouts } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import Panel from "@core/components/Panel";
import FiltersPanel from "../components/FiltersPanel";
import IndicatorListPanel from "../components/IndicatorListPanel";
import DetailPanel from "../components/DetailPanel";
import StatusLegendButton from "../components/StatusLegendButton";
import { ApiClient } from "@core/api/http";
import { API_URL } from "@config/envMerge";
import { useIndicatorsData } from "../hooks/useIndicatorsData";
import { useIndicatorMetadata } from "../hooks/useIndicatorMetadata";
import { useSyncSelectionFromUrl } from "../hooks/useIndicatorSelection";
import { useIndicatorsStore } from "../store/indicators.store";
import { useErrorToast } from "@core/toast";
import { isoMonthEnd } from "@lib/period";

const ResponsiveGrid = WidthProvider(Responsive);

function useVhRowHeightExact(totalRows: number, marginY: number, containerPaddingY: number) {
  const compute = useCallback(() => {
    const vh = window.innerHeight;
    return (vh - 2 * containerPaddingY + marginY) / totalRows - marginY;
  }, [totalRows, marginY, containerPaddingY]);

  const [rowH, setRowH] = useState<number>(() => compute());

  useEffect(() => {
    const onResize = () => setRowH(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [compute]);

  return rowH;
}

export default function IndicatorsPage() {
  const api = useMemo(() => new ApiClient({ baseUrl: API_URL }), []);

  // Get manual fetch functions
  const fetchMetadata = useIndicatorMetadata(api);
  const fetchIndicatorsData = useIndicatorsData(api);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();

  // Get error states (loading UI lives in the Filters panel)
  const { error, metadataError, setEndDate, setRoundEndDate } = useIndicatorsStore();
  const appliedEndDate = useIndicatorsStore((s) => s.appliedFilters.endDate);

  // Surface load errors as floating toasts (see @core/toast).
  useErrorToast(metadataError, (e) => `Error loading metadata: ${String((e as Error)?.message ?? e)}`);
  useErrorToast(error, (e) => `Error loading data: ${String((e as Error)?.message ?? e)}`);

  // Pure load (no URL side-effect). Starting a load aborts any in-flight one, so
  // this is safe to call repeatedly (e.g. rapid Back presses). Used both by user
  // actions and by history navigation.
  const loadData = useCallback(async () => {
    await fetchMetadata(); // only fetches metadata the first time
    fetchIndicatorsData();
  }, [fetchMetadata, fetchIndicatorsData]);

  // Record a period in the URL as a new history entry so Back/Forward can return
  // to it. The filters must already hold this period.
  const pushPeriodToUrl = useCallback((endDate: string, round: boolean) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("endDate", endDate);
      if (round) next.set("round", "1"); else next.delete("round");
      return next;
    });
  }, [setSearchParams]);

  // "Load data" button: load the period currently in the filters and record it.
  const handleApplyFilters = useCallback(async () => {
    const { endDate, roundEndDate } = useIndicatorsStore.getState().filters;
    if (endDate) pushPeriodToUrl(endDate, roundEndDate);
    await loadData();
  }, [loadData, pushPeriodToUrl]);

  // Right-click "Load this month": set the end date to the last day of that month,
  // record it in the URL, and load. Uses the computed date directly (not a store
  // read-back) so the URL and filters can't lag behind.
  const loadMonth = useCallback((year: number, month: number) => {
    const iso = isoMonthEnd(year, month);
    setEndDate(iso);
    setRoundEndDate(false);
    pushPeriodToUrl(iso, false);
    loadData();
  }, [setEndDate, setRoundEndDate, pushPeriodToUrl, loadData]);

  // Keep the selected indicator in sync with the URL (`/?indicator=<uri>`) so
  // the browser Back/Forward buttons step through the selection history.
  useSyncSelectionFromUrl();

  // Mirror the period from the URL into the filters and (on Back/Forward) reload
  // it. Only acts on real history navigation (POP with a changed URL) or the first
  // mount — never on the user's own pushes — so it can't revert a date the user
  // just set, and transient re-renders (before a push commits) are ignored.
  const urlEndDate = searchParams.get("endDate") || undefined;
  const urlRound = searchParams.get("round") === "1";
  const firstRun = useRef(true);
  const prevUrlEndDate = useRef(urlEndDate);
  useEffect(() => {
    const dateChanged = urlEndDate !== prevUrlEndDate.current;
    const isFirst = firstRun.current;
    prevUrlEndDate.current = urlEndDate;
    firstRun.current = false;

    if ((isFirst || (navigationType === "POP" && dateChanged)) && urlEndDate !== undefined) {
      const f = useIndicatorsStore.getState().filters;
      if (f.endDate !== urlEndDate) setEndDate(urlEndDate);
      if (f.roundEndDate !== urlRound) setRoundEndDate(urlRound);
    }

    // A fresh load aborts any in-flight one, so rapid Back presses cancel the
    // previous load and settle on the last.
    if (!isFirst && navigationType === "POP" && dateChanged && urlEndDate && urlEndDate !== appliedEndDate) {
      loadData();
    }
  }, [urlEndDate, urlRound, navigationType, appliedEndDate, setEndDate, setRoundEndDate, loadData]);

  // Three column layout: Filters (left), Indicator list (middle), Detail (right)
  // Based on dashboard2.pdf structure
  const layouts = useMemo<Layouts>(
    () => ({
      lg: [
        { i: "filters", x: 0, y: 0, w: 2, h: 100, minW: 2, minH: 30 },
        { i: "chartList", x: 2, y: 0, w: 5, h: 100, minW: 3, minH: 30 },
        { i: "detail", x: 7, y: 0, w: 5, h: 100, minW: 3, minH: 30 },
      ],
      md: [
        { i: "filters", x: 0, y: 0, w: 2, h: 100 },
        { i: "chartList", x: 2, y: 0, w: 4, h: 100 },
        { i: "detail", x: 6, y: 0, w: 4, h: 100 },
      ],
      sm: [
        { i: "filters", x: 0, y: 0, w: 4, h: 70 },
        { i: "chartList", x: 0, y: 40, w: 4, h: 70 },
        { i: "detail", x: 0, y: 90, w: 4, h: 70 },
      ],
      xs: [
        { i: "filters", x: 0, y: 0, w: 4, h: 70 },
        { i: "chartList", x: 0, y: 40, w: 4, h: 70 },
        { i: "detail", x: 0, y: 90, w: 4, h: 70 },
      ],
    }),
    []
  );

  const totalRows = 100;
  const marginY = 12;
  const containerPaddingY = 12;
  const rowHeight = useVhRowHeightExact(totalRows, marginY, containerPaddingY);

  return (
    <div style={{ height: "100vh" }}>
      <ResponsiveGrid
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 8, xs: 4, xxs: 2 }}
        rowHeight={rowHeight}
        margin={[12, 12]}
        containerPadding={[12, 12]}
        isBounded
        compactType={null}
        draggableHandle=".drag-handle"
        draggableCancel=".panel-actions, .panel-actions *, input, select, textarea, button, .no-drag"
      >
        <div key="filters">
          <Panel title="Filters">
            <FiltersPanel onApplyFilters={handleApplyFilters} />
          </Panel>
        </div>

        <div key="chartList">
          <Panel title="Indicators" actions={<StatusLegendButton />}>
            <IndicatorListPanel onLoadMonth={loadMonth} />
          </Panel>
        </div>

        <div key="detail">
          <Panel title="Details">
            <DetailPanel />
          </Panel>
        </div>
      </ResponsiveGrid>
    </div>
  );
}
