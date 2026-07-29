import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Responsive, WidthProvider, type Layouts } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import Panel from "@core/components/Panel";
import FiltersPanel from "../components/FiltersPanel";
import DataTable, { DataTableStatus } from "../components/DataTable";

import { ApiClient, ApiTimeoutError } from "@core/api/http";
import { useApiQuery } from "@core/api/useApiQuery";
import { fetchEventTypes } from "../api/inspectionTypes";
import { fetchInspectedConditions, fetchIndicatorConditions } from "../api/inspectedConditions";
import { useDashboardStore, useEvents, useHasGeometry, useChartScaleToFiltered, type EventType } from "../store/dashboard.store";
import { isValidDateFormat } from "@lib/date";

import type { MapLeafletHandle } from "../components/MapLeaflet";
import MapLeaflet from "../components/MapLeaflet";
import DayChartPanel from "../components/DayChartPanel";
import { useSearchParams } from "react-router-dom";
import { API_URL } from "@config/envMerge";
import { useErrorToast } from "@core/toast";

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

export default function DashboardPage() {
  const mapRef = useRef<MapLeafletHandle>(null);
  const [searchParams] = useSearchParams();
  const indicatorUri = searchParams.get('indicatorUri');
  const indicatorTitle = searchParams.get('title');

  const api = useMemo(() => new ApiClient({ baseUrl: API_URL }), []);

  const setEventTypesAll = useDashboardStore((s) => s.setEventTypesAll);
  const setTimeRange = useDashboardStore((s) => s.setTimeRange);
  const setIndicatorUri = useDashboardStore((s) => s.setIndicatorUri);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<unknown>(undefined);
  // True once the date range changed and cleared already-loaded data, until the
  // next load. Drives the "Period changed, reload data" hint.
  const [periodChanged, setPeriodChanged] = useState(false);
  const loadFromSource   = useDashboardStore((s) => s.loadFromSource);
  const setData = useDashboardStore((s) => s.setData);
  const timeFilter = useDashboardStore((s) => s.filters.time);
  const events = useEvents();
  const hasGeometry = useHasGeometry();
  const chartScaleToFiltered = useChartScaleToFiltered();
  const setChartScaleToFiltered = useDashboardStore((s) => s.setChartScaleToFiltered);

  // Register the loaded indicator so filters can resolve its discrepancy rule.
  useEffect(() => {
    setIndicatorUri(indicatorUri ?? null);
  }, [indicatorUri, setIndicatorUri]);

  // Show the map unless we know the loaded data has no coordinates (e.g. SI-7).
  const showMap = hasGeometry || events.length === 0;

  // Seed time filter from URL search params (used when opening from indicators page)
  useEffect(() => {
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (startDate && endDate) {
      setTimeRange(startDate, endDate);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isTimeout = eventsError instanceof ApiTimeoutError;
  const isOtherError = eventsError != null && !isTimeout;

  // read EventTypes from REST API
  const { data: eventTypes, error: eventTypesError } =
    useApiQuery(["eventtypes"], () => fetchEventTypes(api));

  // Surface all errors as floating toasts (see @core/toast). Loading is shown
  // inline on the Load data button, so it gets no toast.
  useErrorToast(eventTypesError, "Failed to load event types.");
  useErrorToast(isTimeout ? eventsError : null, "The request timed out — try a shorter date range.");
  useErrorToast(
    isOtherError ? eventsError : null,
    (e) => `Failed to load data: ${String((e as Error)?.message ?? e)}`,
  );

  // Seed the filter's type catalog from the inspection-types endpoint — but only
  // in general mode. In indicator mode the types come from the data (finding
  // types like "typ-nalezu-3"), and seeding the catalog here would set
  // selectedIds to catalog ids that never match, hiding every record.
  useEffect(() => {
    if (eventTypes && !indicatorUri) setEventTypesAll(eventTypes);
  }, [eventTypes, setEventTypesAll, indicatorUri]);

  // Cancellable data load, triggered only on initial page load and when the user
  // clicks "Load data" — not on every filter change. Aborts any in-flight load
  // first, so it's safe to call repeatedly.
  const loadControllerRef = useRef<AbortController | null>(null);
  const eventTypesRef = useRef(eventTypes);
  eventTypesRef.current = eventTypes;

  const doLoad = useCallback(() => {
    const { start, end } = useDashboardStore.getState().filters.time;
    if (!isValidDateFormat(start) || !isValidDateFormat(end)) return;

    // Query the exact displayed range. The client time filter (makeInTime) still
    // trims to exact local-day boundaries, which is what actually guards against
    // the boundary-day bug — no server-side widening needed.
    const fetchStart = start!;
    const fetchEnd = end!;

    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;

    setEventsError(undefined);
    setEventsLoading(true);
    setPeriodChanged(false);
    loadFromSource(async () => {
      if (indicatorUri) {
        // Indicator mode: page through /root-dashboard/indicators/data and derive
        // the type catalog from the returned data (finding types like "typ-nalezu-3").
        const { events } = await fetchIndicatorConditions(api, indicatorUri, fetchStart, fetchEnd, {
          signal: controller.signal,
        });
        const seenTypes = new Map<string, EventType>();
        for (const evt of events) {
          const tid = evt.properties.typeId;
          if (tid && !seenTypes.has(tid)) seenTypes.set(tid, { id: tid, label: evt.properties.name });
        }
        return { events, allEventTypes: Array.from(seenTypes.values()) };
      }
      // General mode: needs the inspection-types catalog to resolve names.
      const et = eventTypesRef.current;
      if (!et) return { events: [] };
      const { events, missingEventTypes } = await fetchInspectedConditions(api, et, fetchStart, fetchEnd, {
        signal: controller.signal,
      });
      if (missingEventTypes.length > 0) setEventTypesAll([...et, ...missingEventTypes]);
      return { events };
    })
      .catch((e) => {
        if (!controller.signal.aborted) setEventsError(e);
      })
      .finally(() => {
        if (loadControllerRef.current === controller) {
          loadControllerRef.current = null;
          setEventsLoading(false);
        }
      });
  }, [api, indicatorUri, loadFromSource, setEventTypesAll]);

  const cancelLoad = useCallback(() => {
    loadControllerRef.current?.abort();
    loadControllerRef.current = null;
    setEventsLoading(false);
  }, []);

  // Changing the date range invalidates the loaded data (and any in-flight load):
  // it was fetched for the old window. Abort the load and blank the data so the
  // chart/table/map clear instead of rescaling to show stale/empty bars — the user
  // reloads via "Load data". Declared BEFORE the auto-load effect so, on the first
  // date seed, it runs first (a harmless no-op on empty data) and does not cancel
  // the auto-load that follows.
  useEffect(() => {
    loadControllerRef.current?.abort();
    loadControllerRef.current = null;
    setEventsLoading(false);
    let cleared = false;
    setData((d) => {
      if (d.events.length === 0) return d;
      cleared = true;
      return { ...d, events: [] };
    });
    // Only prompt to reload when data was actually dropped (not on the first
    // date seed, when there's nothing loaded yet).
    if (cleared) setPeriodChanged(true);
  }, [timeFilter.start, timeFilter.end, setData]);

  // Auto-load once when prerequisites are first met (valid dates; in general mode
  // also the type catalog). Re-fires when the indicator changes — a new indicator
  // is a fresh "page start" — but NOT on date or other filter changes.
  const autoLoadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isValidDateFormat(timeFilter.start) || !isValidDateFormat(timeFilter.end)) return;
    if (!indicatorUri && !eventTypes) return;
    const key = indicatorUri ?? "__general__";
    if (autoLoadedKeyRef.current === key) return;
    autoLoadedKeyRef.current = key;
    doLoad();
  }, [indicatorUri, eventTypes, timeFilter.start, timeFilter.end, doLoad]);

  // On unmount, abort any in-flight load and clear the auto-load guard so a
  // remount (real navigation, or React StrictMode's dev re-mount) loads afresh.
  useEffect(
    () => () => {
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
      autoLoadedKeyRef.current = null;
    },
    [],
  );

  // 2 columns (equal width), two panels top/bottom in each:
  // left column: 60% + 40%
  // right column: 25% + 75%
  const layouts = useMemo<Layouts>(
    () => ({
      lg: [
        { i: "filters", x: 0, y: 0,  w: 4, h: 60, minW: 3, minH: 10 },
        { i: "table",   x: 0, y: 60, w: 4, h: 40, minW: 3, minH: 10 },
        { i: "chart",   x: 4, y: 0,  w: 8, h: 30, minW: 3, minH: 10 },
        { i: "map",     x: 4, y: 25, w: 8, h: 70, minW: 3, minH: 10 },
      ],
      md: [
        { i: "filters", x: 0, y: 0,  w: 5, h: 60 },
        { i: "table",   x: 0, y: 60, w: 5, h: 40 },
        { i: "chart",   x: 5, y: 0,  w: 5, h: 25 },
        { i: "map",     x: 5, y: 25, w: 5, h: 75 },
      ],
      sm: [
        { i: "filters", x: 0, y: 0, w: 4, h: 40 },
        { i: "table",   x: 0, y: 40, w: 4, h: 40 },
        { i: "chart",   x: 0, y: 80, w: 4, h: 20 },
        { i: "map",     x: 0, y: 100, w: 4, h: 100 },
      ],
      xs: [
        { i: "filters", x: 0, y: 0,  w: 4, h: 40 },
        { i: "table",   x: 0, y: 40, w: 4, h: 40 },
        { i: "chart",   x: 0, y: 80, w: 4, h: 20 },
        { i: "map",     x: 0, y: 100, w: 4, h: 100 },
      ],
    }),
    []
  );

  // margin between cards 12 px (vertical), in each column we have 1 gap
  // const marginY = 12;
  // const rowHeight = useVhRowHeight(100, marginY, /*gaps*/ 1);
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
            <FiltersPanel loading={eventsLoading} periodChanged={periodChanged} onLoad={doLoad} onCancel={cancelLoad} />
          </Panel>
        </div>

        <div key="table">
          <Panel title="Table" actions={<DataTableStatus />}>
            <DataTable />
          </Panel>
        </div>

        <div key="chart">
          <Panel
            title={indicatorTitle ? `Chart - ${indicatorTitle}` : "Chart"}
            actions={
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={chartScaleToFiltered}
                  onChange={(e) => setChartScaleToFiltered(e.target.checked)}
                />
                Only filtered
              </label>
            }
          >
            <DayChartPanel />
          </Panel>
        </div>

        <div key="map">
          <Panel
            title="Map"
            actions={
              showMap ? (
                <button onClick={() => mapRef.current?.fitToFilteredPoints()}>Fit to data</button>
              ) : undefined
            }
          >
            {showMap ? (
              <MapLeaflet ref={mapRef} />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: 16,
                  color: "#6b7280",
                  fontSize: 13,
                }}
              >
                This indicator has no location data.
              </div>
            )}
          </Panel>
        </div>
      </ResponsiveGrid>
    </div>
  );
}
