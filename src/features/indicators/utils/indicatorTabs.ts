import type { IndicatorMetadata } from "../api/indicators";

// Ontology types the list tabs partition indicators by.
const SPK = "http://onto.fel.cvut.cz/ontologies/safety-performance-kpis/";
export const LAGGING_INDICATOR_TYPE = `${SPK}lagging-indicator`;
export const LEADING_INDICATOR_TYPE = `${SPK}leading-indicator`;

// Importance boundaries splitting each ontology type into its two tabs.
export const LAGGING_IMPORTANCE_SPLIT = 100;
export const LEADING_IMPORTANCE_SPLIT = 50;

/** The four indicator-list tabs: lagging/leading indicators, each split by importance. */
export type ListTab = "importance_100+" | "importance_90-99" | "importance_50-89" | "importance_0-49";

export type TabFilterCriteria = {
  importanceMin: number;
  importanceMax: number; // exclusive
  type: string;
};

/** Filter criteria for each tab. */
export function getTabFilterCriteria(tab: ListTab): TabFilterCriteria {
  switch (tab) {
    case "importance_100+":
      return { importanceMin: LAGGING_IMPORTANCE_SPLIT, importanceMax: Infinity, type: LAGGING_INDICATOR_TYPE };
    case "importance_90-99":
      return { importanceMin: 0, importanceMax: LAGGING_IMPORTANCE_SPLIT, type: LAGGING_INDICATOR_TYPE };
    case "importance_50-89":
      return { importanceMin: LEADING_IMPORTANCE_SPLIT, importanceMax: Infinity, type: LEADING_INDICATOR_TYPE };
    case "importance_0-49":
      return { importanceMin: 0, importanceMax: LEADING_IMPORTANCE_SPLIT, type: LEADING_INDICATOR_TYPE };
  }
}

/** Indicators matching a tab's importance range and ontology type. */
export function filterIndicatorsByCriteria(
  indicators: IndicatorMetadata[],
  criteria: TabFilterCriteria,
): IndicatorMetadata[] {
  return indicators.filter(ind =>
    ind.importance >= criteria.importanceMin &&
    ind.importance < criteria.importanceMax &&
    ind.types.includes(criteria.type)
  );
}
