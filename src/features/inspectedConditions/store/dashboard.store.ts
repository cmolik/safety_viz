import { create } from "zustand";
import type { ColorScaleId } from "@lib/colorScales";

/** Source data (GeoJSON-like) */
export type GeoJSONFeature = {
  type: "Feature";
  properties: {
    id: number | string;
    name: string;
    typeId?: string;
    date: string;
    highlighted: boolean;
    selected: boolean;
    /** The full source row this feature was mapped from. Each indicator has a
     * different key set, so this is kept untyped and drives per-indicator
     * filters (e.g. "only discrepancies"). Undefined for legacy/mock data. */
    raw?: Record<string, unknown>;
  };
  geometry?: { type: "Point"; coordinates: [number, number] } | null; // [lon, lat] - optional for items without location
};

export type EventType = {
  id: string;           
  label: string;        
};

export type DashboardData = { events: GeoJSONFeature[] };

/** Filters / visualization settings */
export const VisualizationMode = {
  Time: "time",
  Type: "type",
  Heatmap: "heatmap",
} as const;
export type VisualizationMode = typeof VisualizationMode[keyof typeof VisualizationMode];

// The scale-id type lives with the interpolators in @lib/colorScales; re-exported
// here because filter state and its consumers historically import it from the store.
export type { ColorScaleId } from "@lib/colorScales";

export const PresetTimeFilter = {
  Past7Days:  "past-7-days",
  Past30Days: "past-30-days",
  Custom:     "custom",
} as const;

export type PresetTimeFilter = typeof PresetTimeFilter[keyof typeof PresetTimeFilter];

export type FilterState = {
  visualization: VisualizationMode;
  colorScale: ColorScaleId;
  time: { preset: PresetTimeFilter; start?: string; end?: string };
  eventTypes: {
    all: EventType[];
    selectedIds: string[];
    query: string;
  };
  withPosition: boolean;           // when false, exclude events that DO have a position
  includeWithoutPosition: boolean; // when false, exclude events with 0,0 or null geometry
  showDiscrepancy: boolean;        // when false, exclude rows the indicator profile marks as a discrepancy
  showNonDiscrepancy: boolean;     // when false, exclude rows that are NOT a discrepancy
};

/**
 * A dynamic, per-column filter on the raw row of a feature. The available
 * columns come from the indicator's schema; each control writes its state here
 * keyed by column name. Empty state (no exclusions / no bounds) means "inactive"
 * and the key is removed. Interpreted by `makeColumnPredicate`.
 */
export type ColumnFilter =
  | { kind: "category"; excluded: string[] }            // hide these distinct values ("" = blank)
  | { kind: "range"; min: number | null; max: number | null };

function normalizeEventTypes(items: (EventType | string)[]): EventType[] {
  return items.map((it) => (typeof it === "string" ? { id: it, label: it } : it));
}

export const featureTypeId = (f: GeoJSONFeature) => f.properties.name;

/** State */
type DashboardState = {
  data: DashboardData;
  filters: FilterState;
  /** URI of the indicator currently loaded (indicator mode), or null in the
   * general inspected-conditions mode. Drives the per-indicator discrepancy
   * predicate. */
  indicatorUri: string | null;
  /** Day chart y-axis scaling: when true, scale to the busiest filtered day
   * (matches table/map); when false, scale to the busiest day overall in the
   * range, ignoring the active filters. */
  chartScaleToFiltered: boolean;
  /** Base radius (px, at the reference zoom) for the map heatmap. */
  heatRadius: number;
  /** Dynamic per-column filters, keyed by raw column name (schema-driven). */
  columnFilters: Record<string, ColumnFilter>;

  // data
  setData: (updater: (d: DashboardData) => DashboardData) => void;
  clearHighlighted: () => void;
  setIndicatorUri: (uri: string | null) => void;
  setChartScaleToFiltered: (v: boolean) => void;
  setHeatRadius: (v: number) => void;

  // dynamic column filters
  setColumnCategoryExcluded: (col: string, excluded: string[]) => void;
  setColumnRange: (col: string, min: number | null, max: number | null) => void;
  clearColumnFilter: (col: string) => void;

  // filters
  setVisualization: (v: VisualizationMode) => void;
  setColorScale: (id: ColorScaleId) => void;
  setTimePreset: (p: PresetTimeFilter) => void;
  setTimeRange: (start?: string, end?: string) => void;
  setEventTypesSelected: (updater: string[] | ((prev: string[]) => string[])) => void;
  selectAllEventTypes: () => void;
  setEventTypesQuery: (q: string) => void;
  setEventTypesAll: (all: (EventType | string)[]) => void;
  setWithPosition: (v: boolean) => void;
  setIncludeWithoutPosition: (v: boolean) => void;
  setShowDiscrepancy: (v: boolean) => void;
  setShowNonDiscrepancy: (v: boolean) => void;
  resetFilters: () => void;

  // unified loader (mock/REST) - returns RawFeature[] + list of types
  loadFromSource: (loader: () => Promise<{ events: GeoJSONFeature[]; allEventTypes?: (EventType | string)[] }>) => Promise<void>;
};

// Time extent selector
let __extentCache: [string, string] | null = null;
let __extentKey = "";
const selectLoadedTimeExtent = (s: DashboardState): [string, string] | null => {
  const feats = s.data?.events;
  if (!feats || feats.length === 0) return null;
  let min = Infinity, max = -Infinity;
  for (const f of feats) {
    const t = Date.parse(f.properties.date);
    if (!Number.isNaN(t)) {
      if (t < min) min = t;
      if (t > max) max = t;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const minIso = new Date(min).toISOString();
  const maxIso = new Date(max).toISOString();
  const key = `${minIso}|${maxIso}`;
  if (__extentCache && key === __extentKey) return __extentCache;
  __extentKey = key;
  __extentCache = [minIso, maxIso];
  return __extentCache;
};

const initialData: DashboardData = { events: [] };

const initialFilters: FilterState = {
  visualization: VisualizationMode.Time,
  colorScale: "interpolateInferno",
  time: { preset: PresetTimeFilter.Custom },
  eventTypes: { all: [], selectedIds: [], query: ""},
  withPosition: true,
  includeWithoutPosition: false,
  showDiscrepancy: true,
  showNonDiscrepancy: true,
};

/** Store */
export const useDashboardStore = create<DashboardState>((set) => ({
  data: initialData,
  filters: initialFilters,
  indicatorUri: null,
  chartScaleToFiltered: false,
  heatRadius: 25,
  columnFilters: {},

  setData: (updater) => set((s) => ({ data: updater(s.data) })),
  // Switching indicators invalidates any column filters (they're keyed by that
  // indicator's schema columns), so clear them alongside the uri.
  setIndicatorUri: (uri) =>
    set((s) => (s.indicatorUri === uri ? s : { indicatorUri: uri, columnFilters: {} })),
  setChartScaleToFiltered: (v) => set((s) => (s.chartScaleToFiltered === v ? s : { chartScaleToFiltered: v })),
  setHeatRadius: (v) => set((s) => (s.heatRadius === v ? s : { heatRadius: v })),

  setColumnCategoryExcluded: (col, excluded) =>
    set((s) => {
      const next = { ...s.columnFilters };
      if (excluded.length === 0) delete next[col];
      else next[col] = { kind: "category", excluded };
      return { columnFilters: next };
    }),
  setColumnRange: (col, min, max) =>
    set((s) => {
      const next = { ...s.columnFilters };
      if (min == null && max == null) delete next[col];
      else next[col] = { kind: "range", min, max };
      return { columnFilters: next };
    }),
  clearColumnFilter: (col) =>
    set((s) => {
      if (!(col in s.columnFilters)) return s;
      const next = { ...s.columnFilters };
      delete next[col];
      return { columnFilters: next };
    }),

  setVisualization: (v) => set((s) => ({ filters: { ...s.filters, visualization: v } })),
  setColorScale: (id) => set((s) => ({ filters: { ...s.filters, colorScale: id } })),
  setTimePreset: (p) => set((s) => ({ filters: { ...s.filters, time: { ...s.filters.time, preset: p } } })),
  setTimeRange: (start, end) =>
    set((s) => {
      const cur = s.filters.time;
      if (cur.start === start && cur.end === end) return s;
      return { filters: { ...s.filters, time: { ...cur, start, end } } };
    }),
  setEventTypesAll: (all) =>
    set((s) => {
      const norm = all.map((it) => (typeof it === "string" ? { id: it, label: it } : it));
      return {
        filters: {
          ...s.filters,
          eventTypes: {
            ...s.filters.eventTypes,
            all: norm,
            selectedIds: norm.map((t) => t.id),
          },
        },
      };
    }),
  setEventTypesQuery: (q: string) =>
    set((s) => ({ filters: { ...s.filters, eventTypes: { ...s.filters.eventTypes, query: q } } })),
  setWithPosition: (v) =>
    set((s) => ({ filters: { ...s.filters, withPosition: v } })),
  setIncludeWithoutPosition: (v) =>
    set((s) => ({ filters: { ...s.filters, includeWithoutPosition: v } })),
  setShowDiscrepancy: (v) =>
    set((s) => ({ filters: { ...s.filters, showDiscrepancy: v } })),
  setShowNonDiscrepancy: (v) =>
    set((s) => ({ filters: { ...s.filters, showNonDiscrepancy: v } })),

  selectAllEventTypes: () =>
    set((s) => ({
      filters: {
        ...s.filters,
        eventTypes: {
          ...s.filters.eventTypes,
          selectedIds: s.filters.eventTypes.all.map((t) => t.id),
        },
      },
    })),
  loadFromSource: async (loader) => {
    const { events, allEventTypes } = await loader();
    set((s) => {
      const prevAll = s.filters.eventTypes.all;
      const nextAll = allEventTypes ? normalizeEventTypes(allEventTypes) : prevAll;
      const byId = new Map(prevAll.map((t) => [t.id, t]));
      for (const t of nextAll) {
        if (!byId.has(t.id)) byId.set(t.id, t);
      }
      const merged = Array.from(byId.values());
      const prevSel = s.filters.eventTypes.selectedIds;
      const nextSel = prevSel.length ? prevSel : merged.map((t) => t.id);
      return {
        data: { ...s.data, events },
        filters: {
          ...s.filters,
          eventTypes: { ...s.filters.eventTypes, all: merged, selectedIds: nextSel },
        },
      };
    });    
  },
  setEventTypesSelected: (updater) =>
    set((s) => {
      const prev = s.filters.eventTypes.selectedIds;
      const next = typeof updater === "function" ? (updater as (p: string[]) => string[])(prev) : updater;
      return {
        filters: {
          ...s.filters,
          eventTypes: { ...s.filters.eventTypes, selectedIds: next },
        },
      };
    }),
  resetFilters: () => set(() => ({ filters: initialFilters, columnFilters: {} })),

  clearHighlighted: () =>
  set((s) => ({
    data: {
      ...s.data,
      events: s.data.events.map((f) => ({
        ...f,
        properties: { ...f.properties, highlighted: false },
      })),
    },
  })),
}));


export const useEvents = () => useDashboardStore((s) => s.data.events);
export const useEventTypesAll     = () => useDashboardStore((s) => s.filters.eventTypes.all);
export const useSelectedTypeIds   = () => useDashboardStore((s) => s.filters.eventTypes.selectedIds);
export const useEventTypesQuery   = () => useDashboardStore((s) => s.filters.eventTypes.query);
export const useTimeFilter = () => useDashboardStore((s) => s.filters.time);
export const useColorScale = () => useDashboardStore((s) => s.filters.colorScale);
export const useVisualization = () => useDashboardStore((s) => s.filters.visualization);
export const useWithPosition = () => useDashboardStore((s) => s.filters.withPosition);
export const useIncludeWithoutPosition = () => useDashboardStore((s) => s.filters.includeWithoutPosition);
export const useShowDiscrepancy = () => useDashboardStore((s) => s.filters.showDiscrepancy);
export const useShowNonDiscrepancy = () => useDashboardStore((s) => s.filters.showNonDiscrepancy);
export const useIndicatorUri = () => useDashboardStore((s) => s.indicatorUri);
export const useChartScaleToFiltered = () => useDashboardStore((s) => s.chartScaleToFiltered);
export const useHeatRadius = () => useDashboardStore((s) => s.heatRadius);
export const useColumnFilters = () => useDashboardStore((s) => s.columnFilters);
/** True when the loaded dataset has at least one feature with coordinates. */
export const useHasGeometry = () =>
  useDashboardStore((s) => s.data.events.some((f) => !!f.geometry && !!f.geometry.coordinates));
export const useLoadedTimeExtent = (): [string, string] | null =>
  useDashboardStore((s) => selectLoadedTimeExtent(s));
