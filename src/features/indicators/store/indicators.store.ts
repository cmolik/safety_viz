import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  TimeScale,
  CategoryLevel,
  IndicatorMetadata,
  IndicatorOverviewDataPoint,
  StpaInteraction,
} from "../api/indicators";
import {
  fetchIndicatorOverview,
  fetchStpaContexts,
  fetchStpaDiagram,
  fetchStpaInteractions,
  getIndicatorVariables,
} from "../api/indicators";
import type { IndicatorComment, NewIndicatorComment, IndicatorCommentUpdate } from "../api/comments";
import {
  fetchComments as fetchCommentsApi,
  createComment as createCommentApi,
  updateComment as updateCommentApi,
  deleteComment as deleteCommentApi,
  commentsByIndicator,
} from "../api/comments";
import { toast } from "@core/toast";
import type { ApiClient } from "@core/api/http";
import type { ValueMode } from "../utils/valueMode";
import {
  detailHistoryKey,
  extendEndDateByMonths,
  overviewStartDate,
  historicalStartDate,
} from "../utils/indicatorWindow";
import { idbSessionStorage } from "./idbSessionStorage";

// Re-exported because DetailPanel historically imports it from the store.
export { detailHistoryKey } from "../utils/indicatorWindow";

/** ===== Filter State ===== */
export type IndicatorsFilterState = {
  endDate?: string; // Only end date, start date calculated as 1 year before
  roundEndDate: boolean; // If true, endDate is rounded to the last day of its month (only relevant with a specific-day endDate)
  selectedCategories: string[]; // URIs
  level: CategoryLevel;
  path: boolean;
  redline: boolean;
  greenline: boolean;
};

/** ===== Store State ===== */
type IndicatorsState = {
  // Data from API - per-indicator overview data
  indicatorData: Record<string, IndicatorOverviewDataPoint[]>; // Key is indicator URI
  loading: boolean;
  error: unknown;
  loadingProgress: { loaded: number; total: number } | null; // Track loading progress

  // Historical data (6 years) - per-indicator, loaded in background
  historicalData: Record<string, IndicatorOverviewDataPoint[]>; // Key is indicator URI
  historicalLoading: boolean;
  // The applied period (`endDate::roundEndDate::historyYears`) the historicalData
  // map is valid for. History is refetched per period, so the map is discarded
  // when this changes — bounding the cache to one entry per indicator.
  historicalKey: string | null;

  // Detail-chart history fetched with an end extended by the look-ahead months
  // for the *selected* indicator. Keyed by (uri, lookAhead, historyYears, period)
  // so it's reused while the same view is shown and replaced otherwise.
  detailHistory: { key: string; data: IndicatorOverviewDataPoint[] } | null;

  // Number of historical years (3–8) shown in the detail chart sub-graphs and
  // used as the history fetch depth (getHistoricalStartDate).
  historyYears: number;

  // Months (0–11) the detail chart window is shifted forward to preview upcoming
  // months. Kept in the store so it persists across selecting / deselecting /
  // switching indicators (and a refresh) instead of resetting per indicator.
  lookAhead: number;

  // Indicator comments, keyed by indicator URI. /root-dashboard/comments has no
  // indicator filter — one request returns every indicator's comments for a date
  // range — so the whole range is cached here and shared by all indicators
  // instead of being refetched per selection.
  comments: Record<string, IndicatorComment[]>;
  // The `startDate::endDate` range `comments` holds. The range is derived from
  // the end date, history depth and look-ahead, so any change to those
  // invalidates the cache automatically.
  commentsKey: string | null;
  commentsLoading: boolean;
  commentsError: unknown;

  // Indicator Metadata from /root-dashboard/indicators
  indicatorMetadata: IndicatorMetadata[];
  metadataLoading: boolean;
  metadataError: unknown;

  // STPA Data
  stpaContexts: string[]; // Array of STPA context URIs
  stpaDiagrams: Record<string, string>; // Key is stpaContext URI, value is SVG content
  stpaInteractions: Record<string, StpaInteraction[]>; // Key is stpaContext URI, value is array of interactions
  stpaLoading: boolean;
  stpaError: unknown;

  // UI State
  selectedCategoryUri: string | null; // Which category/indicator is selected
  selectedIndicatorUri: string | null; // Which indicator is selected from metadata list
  selectedTimeScale: TimeScale;

  // How a month's value is derived: its own figure ("month"), a rolling 12-month
  // average ("float") or a year-to-date average ("fixed"). Purely a re-reading of
  // already-loaded data, so it lives outside `filters` and applies immediately —
  // no "Load data" round trip.
  valueMode: ValueMode;

  // Filters
  filters: IndicatorsFilterState;
  // Snapshot of the filters used for the currently loaded data. Visualizations
  // read this (not `filters`) so they don't change while the user edits filters
  // before pressing Apply.
  appliedFilters: IndicatorsFilterState;

  // Actions - Data
  setIndicatorData: (uri: string, data: IndicatorOverviewDataPoint[]) => void;
  clearIndicatorData: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: unknown) => void;
  setLoadingProgress: (progress: { loaded: number; total: number } | null) => void;

  // Actions - Comments
  // Loads every indicator's comments for the current chart range; a no-op when
  // that range is already cached or in flight (pass `force` after a write).
  fetchComments: (api: ApiClient, force?: boolean) => Promise<void>;
  // Creates (no `uri`) or updates (with `uri`) a comment. Resolves true on
  // success; failures are reported to the user and resolve false.
  saveComment: (api: ApiClient, input: NewIndicatorComment | IndicatorCommentUpdate) => Promise<boolean>;
  deleteComment: (api: ApiClient, uri: string) => Promise<boolean>;
  // Local write-back for CRUD: insert or replace by `uri` / drop by `uri`, so a
  // successful PUT/DELETE is reflected without refetching the range.
  upsertComment: (comment: IndicatorComment) => void;
  removeComment: (uri: string) => void;

  // Actions - Indicator Metadata
  setIndicatorMetadata: (metadata: IndicatorMetadata[]) => void;
  setMetadataLoading: (loading: boolean) => void;
  setMetadataError: (error: unknown) => void;

  // Actions - STPA Data
  setStpaContexts: (contexts: string[]) => void;
  setStpaDiagram: (contextUri: string, svg: string) => void;
  setStpaInteractions: (contextUri: string, interactions: StpaInteraction[]) => void;
  setStpaLoading: (loading: boolean) => void;
  setStpaError: (error: unknown) => void;
  fetchStpaData: (api: ApiClient) => Promise<void>;

  // Actions - UI State
  setSelectedCategoryUri: (uri: string | null) => void;
  setSelectedIndicatorUri: (uri: string | null) => void;
  setSelectedTimeScale: (scale: TimeScale) => void;
  setValueMode: (mode: ValueMode) => void;
  setHistoryYears: (years: number) => void; // clamped to [3, 8]; invalidates history caches
  setLookAhead: (lookAhead: number) => void; // clamped to [0, 11]

  // Actions - Filters
  setEndDate: (endDate?: string) => void;
  setRoundEndDate: (roundEndDate: boolean) => void;
  setSelectedCategories: (categories: string[]) => void;
  setLevel: (level: CategoryLevel) => void;
  setPath: (path: boolean) => void;
  setRedline: (redline: boolean) => void;
  setGreenline: (greenline: boolean) => void;
  resetFilters: () => void;

  // Actions - Data Fetching
  fetchAllIndicatorData: (api: ApiClient) => Promise<void>;
  cancelLoad: () => void; // abort an in-progress fetchAllIndicatorData
  fetchHistoricalData: (api: ApiClient, indicatorUri: string, signal?: AbortSignal) => Promise<void>;
  // Warm the 6-year history for every indicator in the background (cancellable).
  prefetchAllHistoricalData: (api: ApiClient) => Promise<void>;
  // Fetch the selected indicator's history with the end extended by `lookAhead`
  // months, for the detail chart's look-ahead view (stored in `detailHistory`).
  fetchDetailHistory: (api: ApiClient, indicatorUri: string, lookAhead: number) => Promise<void>;

  // Computed values
  getStartDate: () => string | undefined; // Calculate 12 months before end date
  getHistoricalStartDate: () => string | undefined; // Calculate 6 years before end date
  getTimeScales: () => TimeScale[]; // Always returns ["days"]
  // Date range the comments cache covers: the same window the detail chart's
  // sub-graphs show (history depth back .. end date extended by look-ahead).
  getCommentsRange: () => { startDate: string; endDate: string } | null;

  // Selectors
  getSelectedIndicatorData: () => IndicatorOverviewDataPoint[] | null;
  getSelectedHistoricalData: () => IndicatorOverviewDataPoint[] | null;
  getSelectedIndicator: () => IndicatorMetadata | null;
  // The selected indicator's comments, date-sorted. Stable empty array when it
  // has none, so callers can memoize on the result.
  getSelectedIndicatorComments: () => IndicatorComment[];
  getStpaDiagramForIndicator: () => string | null;
  getStpaInteractionsForIndicator: () => StpaInteraction[] | null;
};

// AbortController for the in-progress fetchAllIndicatorData load (module-scoped
// so it isn't part of React state / doesn't trigger re-renders).
let activeLoadController: AbortController | null = null;

// AbortController for the background history prefetch (warming all indicators'
// 6-year data). Cancelled when a new load starts or the period changes.
let activePrefetchController: AbortController | null = null;

// URIs whose history is currently being fetched, so the background prefetch and
// an on-demand selection never fetch the same indicator twice.
const inFlightHistorical = new Set<string>();

// In-flight comments request and the range key it is for, so concurrent callers
// (every selected indicator asks for the same range) share one request.
let activeCommentsController: AbortController | null = null;
let inFlightCommentsKey: string | null = null;

// Shared empty result for indicators without comments — a stable reference so
// `getSelectedIndicatorComments()` is safe to use as a memo dependency.
const NO_COMMENTS: IndicatorComment[] = [];

const initialFilters: IndicatorsFilterState = {
  endDate: undefined,
  roundEndDate: false,
  selectedCategories: [],
  level: 1,
  path: true,
  redline: true,
  greenline: true,
};

export const useIndicatorsStore = create<IndicatorsState>()(persist((set, get) => ({
  // Initial state
  indicatorData: {},
  loading: false,
  error: undefined,
  loadingProgress: null,
  historicalData: {},
  historicalLoading: false,
  historicalKey: null,
  detailHistory: null,
  historyYears: 5,
  lookAhead: 0,
  comments: {},
  commentsKey: null,
  commentsLoading: false,
  commentsError: undefined,
  indicatorMetadata: [],
  metadataLoading: false,
  metadataError: undefined,
  stpaContexts: [],
  stpaDiagrams: {},
  stpaInteractions: {},
  stpaLoading: false,
  stpaError: undefined,
  selectedCategoryUri: null,
  selectedIndicatorUri: null,
  selectedTimeScale: "days", // Fixed to days
  valueMode: "month",
  filters: initialFilters,
  appliedFilters: initialFilters,

  // Data actions
  setIndicatorData: (uri, data) =>
    set((state) => ({
      indicatorData: { ...state.indicatorData, [uri]: data }
    })),
  clearIndicatorData: () => set({ indicatorData: {} }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),

  // Comments actions
  // One request covers every indicator, so this is deduped by range: repeated
  // calls (one per indicator selection) hit the cache or join the in-flight
  // request. `force` bypasses both, for a reload after a write.
  fetchComments: async (api, force = false) => {
    const range = get().getCommentsRange();
    if (!range) return;

    const key = `${range.startDate}::${range.endDate}`;
    if (!force) {
      if (get().commentsKey === key) return;   // already cached for this range
      if (inFlightCommentsKey === key) return; // already loading
    }

    // A different range (or a forced reload) supersedes any in-flight request.
    activeCommentsController?.abort();
    const controller = new AbortController();
    activeCommentsController = controller;
    inFlightCommentsKey = key;
    set({ commentsLoading: true, commentsError: undefined });

    try {
      const data = await fetchCommentsApi(api, range, controller.signal);
      if (!controller.signal.aborted) {
        set({ comments: commentsByIndicator(data), commentsKey: key });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        set({ commentsError: err });
        console.error("Failed to fetch comments:", err);
      }
    } finally {
      // Only clear the flags if this request is still the active one.
      if (activeCommentsController === controller) {
        activeCommentsController = null;
        inFlightCommentsKey = null;
        set({ commentsLoading: false });
      }
    }
  },

  // Every write answers 204 with no body, so nothing comes back to merge:
  // - create has no server-assigned `uri` yet, so the range is re-read;
  // - update knows the whole comment already, so it writes back locally
  //   (`lastUpdatedOn` stays stale until the next range read — it isn't shown).
  saveComment: async (api, input) => {
    const uri = "uri" in input ? input.uri : undefined;
    try {
      if (uri) {
        // Look the old copy up before the write: an edit may move the comment to
        // another indicator, so search every bucket, not just the new one.
        const previous = Object.values(get().comments)
          .flat()
          .find((c) => c.uri === uri);
        await updateCommentApi(api, { ...input, uri });
        get().upsertComment({
          uri,
          indicator: input.indicator,
          date: input.date,
          comment: input.comment,
          commentType: input.commentType ?? null,
          // Server-managed, and the 204 carries no fresh values — keep what we had.
          creationDate: previous?.creationDate ?? null,
          lastUpdatedOn: previous?.lastUpdatedOn ?? null,
        });
        toast.success("Comment updated");
      } else {
        await createCommentApi(api, input);
        await get().fetchComments(api, true); // only way to learn the new `uri`
        toast.success("Comment added");
      }
      return true;
    } catch (err) {
      console.error("Failed to save comment:", err);
      toast.error(`Failed to save comment: ${String((err as Error)?.message ?? err)}`);
      return false;
    }
  },

  deleteComment: async (api, uri) => {
    try {
      await deleteCommentApi(api, uri);
      get().removeComment(uri);
      toast.success("Comment deleted");
      return true;
    } catch (err) {
      console.error("Failed to delete comment:", err);
      toast.error(`Failed to delete comment: ${String((err as Error)?.message ?? err)}`);
      return false;
    }
  },

  upsertComment: (comment) =>
    set((state) => {
      // A comment can move between indicators on edit, so drop it everywhere it
      // might have been before inserting it into its (possibly new) bucket.
      const comments: Record<string, IndicatorComment[]> = {};
      for (const [uri, bucket] of Object.entries(state.comments)) {
        const kept = comment.uri ? bucket.filter((c) => c.uri !== comment.uri) : bucket;
        comments[uri] = kept;
      }
      const bucket = [...(comments[comment.indicator] ?? []), comment];
      bucket.sort((a, b) => a.date.localeCompare(b.date));
      comments[comment.indicator] = bucket;
      return { comments };
    }),

  removeComment: (uri) =>
    set((state) => {
      const comments: Record<string, IndicatorComment[]> = {};
      for (const [indicatorUri, bucket] of Object.entries(state.comments)) {
        comments[indicatorUri] = bucket.filter((c) => c.uri !== uri);
      }
      return { comments };
    }),

  // Indicator Metadata actions
  setIndicatorMetadata: (metadata) => set({ indicatorMetadata: metadata }),
  setMetadataLoading: (loading) => set({ metadataLoading: loading }),
  setMetadataError: (error) => set({ metadataError: error }),

  // STPA Data actions
  setStpaContexts: (contexts) => set({ stpaContexts: contexts }),
  setStpaDiagram: (contextUri, svg) =>
    set((state) => ({
      stpaDiagrams: { ...state.stpaDiagrams, [contextUri]: svg }
    })),
  setStpaInteractions: (contextUri, interactions) =>
    set((state) => ({
      stpaInteractions: { ...state.stpaInteractions, [contextUri]: interactions }
    })),
  setStpaLoading: (loading) => set({ stpaLoading: loading }),
  setStpaError: (error) => set({ stpaError: error }),

  // UI State actions
  setSelectedCategoryUri: (uri) => set({ selectedCategoryUri: uri }),
  setSelectedIndicatorUri: (uri) => set({ selectedIndicatorUri: uri }),
  setSelectedTimeScale: (scale) => set({ selectedTimeScale: scale }),
  setValueMode: (mode) => set({ valueMode: mode }),

  // History depth changes the fetched range, so invalidate the warmed history,
  // its key, and the detail-chart history; they refetch lazily at the new depth.
  setHistoryYears: (years) => {
    const clamped = Math.max(3, Math.min(8, Math.round(years)));
    set({ historyYears: clamped, historicalData: {}, historicalKey: null, detailHistory: null });
  },

  // Detail-chart look-ahead. Only shifts the displayed window; the warmed history
  // is independent of it, so no cache needs invalidating here.
  setLookAhead: (lookAhead) =>
    set({ lookAhead: Math.max(0, Math.min(11, Math.round(lookAhead))) }),

  // Filter actions
  setEndDate: (endDate) =>
    set((state) => ({
      filters: { ...state.filters, endDate },
    })),

  setRoundEndDate: (roundEndDate) =>
    set((state) => ({
      filters: { ...state.filters, roundEndDate },
    })),

  setSelectedCategories: (categories) =>
    set((state) => ({
      filters: { ...state.filters, selectedCategories: categories },
    })),

  setLevel: (level) =>
    set((state) => ({
      filters: { ...state.filters, level },
    })),

  setPath: (path) =>
    set((state) => ({
      filters: { ...state.filters, path },
    })),

  setRedline: (redline) =>
    set((state) => ({
      filters: { ...state.filters, redline },
    })),

  setGreenline: (greenline) =>
    set((state) => ({
      filters: { ...state.filters, greenline },
    })),

  resetFilters: () => set({ filters: initialFilters, appliedFilters: initialFilters, indicatorData: {}, historicalData: {}, historicalKey: null, comments: {}, commentsKey: null, error: undefined }),

  // STPA data fetching action - fetches STPA contexts, diagrams, and interactions
  fetchStpaData: async (api) => {
    set({ stpaLoading: true, stpaError: undefined });

    try {
      // Fetch STPA contexts
      const contexts = await fetchStpaContexts(api);
      set({ stpaContexts: contexts });

      // If contexts exist, fetch diagrams and interactions for each unique context
      if (contexts.length > 0) {
        // Get unique contexts (in case there are duplicates)
        const uniqueContexts = [...new Set(contexts)];

        for (const contextUri of uniqueContexts) {
          try {
            // Fetch diagram and interactions in parallel for this context
            const [diagram, interactions] = await Promise.all([
              fetchStpaDiagram(api, contextUri),
              fetchStpaInteractions(api, contextUri),
            ]);

            // Store the fetched data
            const state = get();
            state.setStpaDiagram(contextUri, diagram);
            state.setStpaInteractions(contextUri, interactions);
          } catch (err) {
            console.error(`Failed to fetch STPA data for context ${contextUri}:`, err);
            // Continue with other contexts even if one fails
          }
        }
      }

      set({ stpaLoading: false });
    } catch (err) {
      set({ stpaError: err, stpaLoading: false });
      console.error("Failed to fetch STPA data:", err);
    }
  },

  // Data fetching action - fetches overview data for all indicators
  fetchAllIndicatorData: async (api) => {
    const state = get();
    const { indicatorMetadata, filters, getStartDate } = state;

    if (indicatorMetadata.length === 0) {
      console.warn("Cannot fetch indicator data: metadata not loaded");
      return;
    }

    if (!filters.endDate) {
      console.warn("Cannot fetch indicator data: end date not set");
      return;
    }

    const startDate = getStartDate();

    // Abort any previous in-flight load (and the previous period's history
    // prefetch) and start a fresh one.
    activeLoadController?.abort();
    activePrefetchController?.abort();
    const controller = new AbortController();
    activeLoadController = controller;

    // History is keyed by indicator URI but is only valid for one period. Reuse
    // the cache on a same-period reload/reselect; discard it when the end date or
    // rounding changes so each indicator's 6-year window refetches for the new
    // period. This caps cached history at one entry per indicator (current period).
    const historicalKey = `${filters.endDate}::${filters.roundEndDate}::${state.historyYears}`;
    const historyReset = state.historicalKey === historicalKey
      ? {}
      : { historicalData: {}, historicalKey };

    set({
      loading: true,
      error: undefined,
      loadingProgress: { loaded: 0, total: indicatorMetadata.length },
      appliedFilters: { ...filters }, // capture the filters this load is for
      indicatorData: {}, // clear previous data
      ...historyReset,
    });

    try {
      // Fetch data for each indicator
      let loaded = 0;
      for (const indicator of indicatorMetadata) {
        if (controller.signal.aborted) break;
        try {
          const data = await fetchIndicatorOverview(api, {
            uri: indicator.uri,
            startDate,
            endDate: filters.endDate,
            roundEndDate: filters.roundEndDate,
            variables: getIndicatorVariables(indicator),
          }, controller.signal);

          // Store the data for this indicator, filtering out entries with null period
          get().setIndicatorData(indicator.uri, data.filter(d => d.period !== null));

          loaded++;
          set({ loadingProgress: { loaded, total: indicatorMetadata.length } });
        } catch (err) {
          if (controller.signal.aborted) break; // cancelled — stop quietly
          console.error(`Failed to fetch data for indicator ${indicator.uri}:`, err);
          // Continue with other indicators even if one fails
        }
      }

      // Last-year data is in; warm every indicator's 6-year history in the
      // background so it's ready (each takes ~1s) by the time the user opens one.
      // Fire-and-forget; it cancels itself if a new load supersedes it.
      if (!controller.signal.aborted) {
        void get().prefetchAllHistoricalData(api);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        set({ error: err });
        console.error("Failed to fetch indicator data:", err);
      }
    } finally {
      // Only clear loading state if this load is still the active one (a newer
      // load or a cancel may have superseded it).
      if (activeLoadController === controller) {
        activeLoadController = null;
        set({ loading: false, loadingProgress: null });
      }
    }
  },

  cancelLoad: () => {
    activeLoadController?.abort();
    activeLoadController = null;
    set({ loading: false, loadingProgress: null });
  },

  // Fetch 6 years of historical data for a single indicator (background, non-blocking).
  // Idempotent: skips if already cached for the current period or already in flight,
  // so the background prefetch and an on-demand selection never double-fetch.
  fetchHistoricalData: async (api, indicatorUri, signal) => {
    const state = get();
    const { filters, getHistoricalStartDate } = state;

    if (!filters.endDate) return;
    if (state.historicalData[indicatorUri]) return; // already cached for this period
    if (inFlightHistorical.has(indicatorUri)) return; // already loading

    const startDate = getHistoricalStartDate();
    if (!startDate) return;

    // Period this fetch belongs to; if the user changes the end date mid-flight
    // (which resets historicalKey), the result is stale and must not be committed.
    const periodKey = state.historicalKey;

    const indicator = state.indicatorMetadata.find((m) => m.uri === indicatorUri);

    inFlightHistorical.add(indicatorUri);
    set({ historicalLoading: true });

    try {
      const data = await fetchIndicatorOverview(api, {
        uri: indicatorUri,
        startDate,
        endDate: filters.endDate,
        roundEndDate: filters.roundEndDate,
        variables: indicator ? getIndicatorVariables(indicator) : undefined,
      }, signal);

      if (get().historicalKey === periodKey) {
        set((s) => ({ historicalData: { ...s.historicalData, [indicatorUri]: data } }));
      }
    } catch (err) {
      if (!signal?.aborted) {
        console.error(`Failed to fetch historical data for ${indicatorUri}:`, err);
      }
    } finally {
      inFlightHistorical.delete(indicatorUri);
      if (inFlightHistorical.size === 0) set({ historicalLoading: false });
    }
  },

  // Warm the 6-year history for every indicator, one at a time (gentle on the
  // backend), so opening an indicator is instant. Cancellable: a new load or a
  // period change aborts it. Already-cached / in-flight indicators are skipped.
  prefetchAllHistoricalData: async (api) => {
    const { indicatorMetadata, filters, historicalKey } = get();
    if (!filters.endDate || indicatorMetadata.length === 0) return;

    activePrefetchController?.abort();
    const controller = new AbortController();
    activePrefetchController = controller;
    const periodKey = historicalKey;

    for (const indicator of indicatorMetadata) {
      // Stop if cancelled or the period changed under us.
      if (controller.signal.aborted || get().historicalKey !== periodKey) break;
      if (get().historicalData[indicator.uri]) continue; // warmed already (or on-demand)
      await get().fetchHistoricalData(api, indicator.uri, controller.signal);
    }

    if (activePrefetchController === controller) activePrefetchController = null;
  },

  // Fetch the selected indicator's history with the end extended by `lookAhead`
  // months so the detail chart's look-ahead columns have full context. Reused
  // while the same (uri, lookAhead, historyYears, period) view is shown.
  fetchDetailHistory: async (api, indicatorUri, lookAhead) => {
    const { filters, getHistoricalStartDate, historyYears, detailHistory } = get();
    if (!filters.endDate) return;

    const key = detailHistoryKey(indicatorUri, lookAhead, historyYears, filters.endDate, filters.roundEndDate);
    if (detailHistory?.key === key) return; // already loaded for this view

    const startDate = getHistoricalStartDate();
    if (!startDate) return;
    const endDate = extendEndDateByMonths(filters.endDate, lookAhead);

    const indicator = get().indicatorMetadata.find((m) => m.uri === indicatorUri);

    try {
      const data = await fetchIndicatorOverview(api, {
        uri: indicatorUri,
        startDate,
        endDate,
        roundEndDate: filters.roundEndDate,
        variables: indicator ? getIndicatorVariables(indicator) : undefined,
      });
      // Commit only if the view this fetch was for is still the current one.
      const cur = get();
      const stillCurrent =
        !!cur.filters.endDate &&
        detailHistoryKey(indicatorUri, lookAhead, cur.historyYears, cur.filters.endDate, cur.filters.roundEndDate) === key;
      if (stillCurrent) set({ detailHistory: { key, data } });
    } catch (err) {
      console.error(`Failed to fetch detail history for ${indicatorUri}:`, err);
    }
  },

  // Computed values
  getStartDate: () => {
    const state = get();
    if (!state.filters.endDate) return undefined;
    return overviewStartDate(state.filters.endDate);
  },

  getHistoricalStartDate: () => {
    const state = get();
    if (!state.filters.endDate) return undefined;
    return historicalStartDate(state.filters.endDate, state.historyYears);
  },

  getTimeScales: () => ["days"], // Always return days only

  // Covers the sub-graph window: `getHistoricalStartDate()` back from the end
  // date (the displayed `historyYears` plus one value-mode look-back year — the
  // extra year's comments simply have no dot to attach to), extended forward by
  // the look-ahead months.
  getCommentsRange: () => {
    const state = get();
    const startDate = state.getHistoricalStartDate();
    if (!startDate || !state.filters.endDate) return null;
    const endDate = state.lookAhead > 0
      ? extendEndDateByMonths(state.filters.endDate, state.lookAhead)
      : state.filters.endDate;
    return { startDate, endDate };
  },

  // Selectors
  getSelectedIndicatorData: () => {
    const state = get();
    if (!state.selectedIndicatorUri) return null;
    return state.indicatorData[state.selectedIndicatorUri] || null;
  },

  getSelectedHistoricalData: () => {
    const state = get();
    if (!state.selectedIndicatorUri) return null;
    return state.historicalData[state.selectedIndicatorUri] || null;
  },

  getSelectedIndicator: () => {
    const state = get();
    if (!state.indicatorMetadata.length || !state.selectedIndicatorUri) return null;
    return state.indicatorMetadata.find(
      (indicator) => indicator.uri === state.selectedIndicatorUri
    ) || null;
  },

  getSelectedIndicatorComments: () => {
    const state = get();
    if (!state.selectedIndicatorUri) return NO_COMMENTS;
    return state.comments[state.selectedIndicatorUri] || NO_COMMENTS;
  },

  getStpaDiagramForIndicator: () => {
    const state = get();
    const indicator = state.getSelectedIndicator();
    if (!indicator || !indicator.stpaContext) return null;
    return state.stpaDiagrams[indicator.stpaContext] || null;
  },

  getStpaInteractionsForIndicator: () => {
    const state = get();
    const indicator = state.getSelectedIndicator();
    if (!indicator || !indicator.stpaContext) return null;
    return state.stpaInteractions[indicator.stpaContext] || null;
  },
}), {
  name: "safety-viz-indicators",
  // IndexedDB (not sessionStorage) so ~60 indicators' overview + history data
  // don't hit the ~5 MB quota. The adapter namespaces records by a per-tab
  // session id, preserving sessionStorage's "fresh per new tab/window, restored
  // on refresh" behaviour. See idbSessionStorage.ts.
  storage: createJSONStorage(() => idbSessionStorage),
  version: 1,
  // Persist only serializable data; transient flags, errors, and functions are
  // excluded and fall back to the store's initial values on rehydrate.
  partialize: (state) => ({
    indicatorData: state.indicatorData,
    historicalData: state.historicalData,
    historicalKey: state.historicalKey,
    indicatorMetadata: state.indicatorMetadata,
    stpaContexts: state.stpaContexts,
    stpaDiagrams: state.stpaDiagrams,
    stpaInteractions: state.stpaInteractions,
    filters: state.filters,
    appliedFilters: state.appliedFilters,
    historyYears: state.historyYears,
    lookAhead: state.lookAhead,
    // selectedIndicatorUri is intentionally NOT persisted — the URL (`?indicator=`)
    // is the source of truth for selection and is restored on refresh.
    selectedCategoryUri: state.selectedCategoryUri,
    selectedTimeScale: state.selectedTimeScale,
    valueMode: state.valueMode,
  }),
}));
