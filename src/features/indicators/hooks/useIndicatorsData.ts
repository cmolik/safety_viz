import { useCallback } from "react";
import { ApiClient } from "@core/api/http";
import { useIndicatorsStore } from "../store/indicators.store";

/**
 * Hook to provide manual data fetching function for indicators
 * Returns a function that can be called to fetch overview data for all indicators
 */
export function useIndicatorsData(api: ApiClient) {
  const { fetchAllIndicatorData } = useIndicatorsStore();

  const fetchIndicatorsData = useCallback(() => {
    fetchAllIndicatorData(api);
  }, [api, fetchAllIndicatorData]);

  return fetchIndicatorsData;
}
