import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useIndicatorsStore } from "../store/indicators.store";

/** URL query param that holds the currently selected indicator URI. */
export const INDICATOR_PARAM = "indicator";

/**
 * Returns a function that selects an indicator by pushing it into the URL
 * (`/?indicator=<uri>`), so the browser Back/Forward buttons step through the
 * selection history. Pass `null` to clear the selection. Re-selecting the
 * already-selected indicator is a no-op (avoids duplicate history entries).
 */
export function useSelectIndicator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = searchParams.get(INDICATOR_PARAM);

  return useCallback(
    (uri: string | null) => {
      if ((uri ?? null) === current) return; // already selected — don't push a duplicate entry
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (uri) next.set(INDICATOR_PARAM, uri);
          else next.delete(INDICATOR_PARAM);
          return next;
        }
        // replace defaults to false -> pushes a new history entry
      );
    },
    [current, setSearchParams]
  );
}

/**
 * Mirrors the URL `indicator` param into the store's selectedIndicatorUri.
 * Runs on mount and on every URL change (clicks, Back/Forward, refresh), making
 * the URL the single source of truth for the selection.
 */
export function useSyncSelectionFromUrl() {
  const [searchParams] = useSearchParams();
  const selectedParam = searchParams.get(INDICATOR_PARAM);
  const setSelectedIndicatorUri = useIndicatorsStore((s) => s.setSelectedIndicatorUri);

  useEffect(() => {
    setSelectedIndicatorUri(selectedParam || null);
  }, [selectedParam, setSelectedIndicatorUri]);
}
