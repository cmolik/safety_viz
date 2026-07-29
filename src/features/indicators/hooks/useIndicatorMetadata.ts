import { useCallback } from "react";
import { ApiClient } from "@core/api/http";
import { fetchIndicatorMetadataWithAssumptions, fetchStpaContexts } from "../api/indicators";
import { useIndicatorsStore } from "../store/indicators.store";

/**
 * Hook to provide manual metadata fetching function
 * Returns a function that can be called to fetch indicator metadata
 */
export function useIndicatorMetadata(api: ApiClient) {
  const {
    indicatorMetadata,
    setIndicatorMetadata,
    setMetadataLoading,
    setMetadataError,
    fetchStpaData,
  } = useIndicatorsStore();

  const fetchMetadata = useCallback(async () => {
    // Skip if we already have metadata
    if (indicatorMetadata.length > 0) {
      return;
    }

    setMetadataLoading(true);
    setMetadataError(undefined);

    try {
      // Fetch metadata and STPA contexts in parallel
      const [data, stpaContexts] = await Promise.all([
        fetchIndicatorMetadataWithAssumptions(api),
        fetchStpaContexts(api)
      ]);

      // After STPA contexts are fetched, assign them to indicators that don't have one
      // Currently, all indicators use the same context (first one from array)
      const enrichedData = data.map(indicator => {
        // If indicator already has stpaContext from metadata, use it
        // Otherwise, use the first context from the fetched contexts
        if (!indicator.stpaContext && stpaContexts.length > 0) {
          return {
            ...indicator,
            stpaContext: stpaContexts[0]
          };
        }
        return indicator;
      });

      setIndicatorMetadata(enrichedData);

      // Now fetch STPA diagrams and interactions for the contexts
      await fetchStpaData(api);
    } catch (err) {
      setMetadataError(err);
      console.error("Failed to fetch indicator metadata:", err);
    } finally {
      setMetadataLoading(false);
    }
  }, [api, indicatorMetadata.length, setIndicatorMetadata, setMetadataLoading, setMetadataError, fetchStpaData]);

  return fetchMetadata;
}
