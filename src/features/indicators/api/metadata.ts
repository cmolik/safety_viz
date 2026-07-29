import { ApiClient } from "@core/api/http";
import type { Assumption } from "./stpa.ts";
import { fetchStpaDescription } from "./stpa.ts";

/** ===== Indicator Metadata Types ===== */

/**
 * Full ontology URI keys for the `params` map returned by root-dashboard/indicators.
 * The API returns each value as an array (length 1 for scalars; 1-3 for the
 * reference lists). Keep these in sync with the backend ontology.
 */
const SPK = "http://onto.fel.cvut.cz/ontologies/safety-performance-kpis/";
export const PARAM_KEYS = {
  monthRedline: `${SPK}month-redline`,
  monthGreenline: `${SPK}month-greenline`,
  relativeRedline: `${SPK}relative-redline`,
  relativeGreenline: `${SPK}relative-greenline`,
  isIndicatorOf: `${SPK}is-indicator-of`,
  direction: `${SPK}direction`,
  selected: `${SPK}selected`,
  selectedBy: `${SPK}selected-by`,
  formulaDescriptor: `${SPK}formula_descriptor`,
  vehicleTypeIri: `${SPK}application-ontology/template_parameter__vehicleTypeIRI`,
  note: `${SPK}note`,
} as const;

/** Trend direction of an indicator's value. */
export type IndicatorDirection = "growing" | "falling";

/**
 * Role a variable plays in an indicator's formula:
 * - `absolute_value` — the numerator / the raw count being measured
 *   (e.g. findings, occurrences, unsatisfactory, numberOfMonths)
 * - `related_to_value` — a denominator or a normalization constant the numerator
 *   is put in relation to (e.g. inspections, movements, constant)
 */
export type VariableRole = "absolute_value" | "related_to_value";

/**
 * One variable of an indicator's formula, as declared by the metadata endpoint.
 * `title` is the variable's real name and is also the column name the overview
 * endpoint reports its per-period values under.
 */
export type IndicatorVarRole = {
  uri: string;
  title: string;
  variableRole: VariableRole | string;
};

/**
 * The variables of an indicator's ratio, resolved from its `varRoles` to the
 * three roles the UI and the value math care about. `constant` is the
 * normalization multiplier shown once in the table header (e.g. 10000); it is
 * null for formulas without one (findings/inspections, numberOfMonths).
 */
export type IndicatorVariables = {
  numerator: string | null;   // absolute_value variable (e.g. "findings", "occurrences")
  denominator: string | null; // related_to_value variable that isn't the constant
  constant: string | null;    // the "constant" related_to_value variable, if any
};

/**
 * Resolves an indicator's formula variables to numerator / denominator /
 * constant. The `formula` string is authoritative — it is parsed into
 * `[numerator*…]/[denominator*…]`, and the factor named "constant" is pulled out
 * as the normalization multiplier (the constant is applied once, never summed;
 * the numerator and denominator are the summed inputs). `variableRole` is only a
 * fallback for older data that has varRoles but no formula.
 *
 * Examples:
 *   findings/inspections             -> num findings,   den inspections
 *   unsatisfactory/inspectedCondition-> num unsatisfactory, den inspectedCondition
 *   constant*occurrences/movements   -> num occurrences, den movements, const constant
 *   numberOfMonths                   -> num numberOfMonths (no denominator)
 */
export function getIndicatorVariables(indicator: IndicatorMetadata): IndicatorVariables {
  const titles = new Set(indicator.varRoles.map((v) => v.title));
  const isConstant = (t: string) => t === "constant";

  const formula = (indicator.formula || "").replace(/\s+/g, "");
  if (formula) {
    const [numPart = "", denPart] = formula.split("/");
    let numerator: string | null = null;
    let denominator: string | null = null;
    let constant: string | null = null;
    for (const tok of numPart.split("*").filter(Boolean)) {
      if (isConstant(tok)) constant = tok;
      else numerator = tok;
    }
    if (denPart != null) {
      for (const tok of denPart.split("*").filter(Boolean)) {
        if (isConstant(tok)) constant = tok;
        else denominator = tok;
      }
    }
    // Trust only tokens that are declared variables, so a malformed formula
    // can't inject a bogus column name into the data reads.
    if (numerator && titles.size && !titles.has(numerator)) numerator = null;
    if (denominator && titles.size && !titles.has(denominator)) denominator = null;
    if (numerator || denominator || constant) return { numerator, denominator, constant };
  }

  // Fallback: derive from variableRole when no formula is provided.
  let numerator: string | null = null;
  let denominator: string | null = null;
  let constant: string | null = null;
  for (const v of indicator.varRoles) {
    if (isConstant(v.title)) constant = v.title;
    else if (v.variableRole === "absolute_value") numerator = v.title;
    else denominator = v.title;
  }
  return { numerator, denominator, constant };
}

/**
 * Normalized view of the raw `params` map. Scalar params are flattened from
 * their single-element arrays; reference params stay as arrays. All fields are
 * defaulted so consumers never touch the raw URI keys.
 */
export type IndicatorParams = {
  monthRedline: number | null;       // absolute monthly redline threshold
  monthGreenline: number | null;     // absolute monthly greenline threshold
  relativeRedline: number | null;    // relative redline (fraction, e.g. 0.2)
  relativeGreenline: number | null;  // relative greenline (fraction, e.g. 0.1)
  direction: IndicatorDirection | null;
  formulaDescriptor: string | null;  // e.g. "#trained/#not-trained"
  selected: boolean;                 // manually curated into the dashboard
  selectedBy: string | null;         // curator, e.g. "LK", "Olda"
  isIndicatorOf: string[];           // assumption URIs this indicator covers
  vehicleTypeIris: string[];         // vehicle-type URIs (template parameter)
  note: string | null;               // free-text note
};

/**
 * Indicator metadata from /root-dashboard/indicators endpoint
 */
export type IndicatorMetadata = {
  uri: string;
  id: string;
  title: string;
  formula: string | null;        // e.g. "findings/inspections", "constant*occurrences/movements"
  varRoles: IndicatorVarRole[];  // the formula's variables and their roles
  dataset: string | null;        // source dataset, e.g. "ghd-inspections", "occurrence-reports"
  order: number;
  importance: number;
  indicatorPresentationType: string;
  groups: string[];
  types: string[];
  detailedIndicators: string[];
  generalIndicators: string[];
  leadingIndicatorRefs: string[];
  laggingIndicatorRefs: string[];
  stpaLosses: string[];
  stpaHazards: string[];
  stpaLossScenarios: string[];
  detailedDashboardEndpoints: string[];
  params: IndicatorParams; // Flattened from the raw `params` map
  assumptions: Assumption[];
  stpaContext: string | null; // STPA context URI (may be in metadata in future, for now fetched separately)
};

/**
 * Raw indicator metadata from API (may have null/undefined values)
 */
type RawIndicatorMetadata = {
  uri?: string | null;
  id?: string | null;
  title?: string | null;
  formula?: string | null;
  varRoles?: Array<{ uri?: string | null; title?: string | null; variableRole?: string | null }> | null;
  dataset?: string | null;
  order?: number | null;
  importance?: number | null;
  indicatorPresentationType?: string | null;
  groups?: string[] | null;
  types?: string[] | null;
  detailedIndicators?: string[] | null;
  generalIndicators?: string[] | null;
  leadingIndicatorRefs?: string[] | null;
  laggingIndicatorRefs?: string[] | null;
  stpaLosses?: string[] | null;
  stpaHazards?: string[] | null;
  stpaLossScenarios?: string[] | null;
  detailedDashboardEndpoints?: string[] | null;
  params?: Record<string, unknown[]> | null; // URI key -> array of values (untrusted)
  stpaContext?: string | null;
};

/** Returns the value array for a param key, or [] if absent/malformed. */
function paramArray(params: RawIndicatorMetadata["params"], key: string): unknown[] {
  if (!params) return [];
  const value = params[key];
  return Array.isArray(value) ? value : [];
}

function firstNumber(params: RawIndicatorMetadata["params"], key: string): number | null {
  const value = paramArray(params, key)[0];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstString(params: RawIndicatorMetadata["params"], key: string): string | null {
  const value = paramArray(params, key)[0];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(params: RawIndicatorMetadata["params"], key: string): string[] {
  return paramArray(params, key).filter((v): v is string => typeof v === "string");
}

/**
 * Flattens the untrusted raw `params` map into a typed IndicatorParams.
 * Scalars are read from their single-element arrays; missing values default
 * to null (or false / empty array for booleans and reference lists).
 */
function normalizeIndicatorParams(params: RawIndicatorMetadata["params"]): IndicatorParams {
  const direction = firstString(params, PARAM_KEYS.direction);
  return {
    monthRedline: firstNumber(params, PARAM_KEYS.monthRedline),
    monthGreenline: firstNumber(params, PARAM_KEYS.monthGreenline),
    relativeRedline: firstNumber(params, PARAM_KEYS.relativeRedline),
    relativeGreenline: firstNumber(params, PARAM_KEYS.relativeGreenline),
    direction: direction === "growing" || direction === "falling" ? direction : null,
    formulaDescriptor: firstString(params, PARAM_KEYS.formulaDescriptor),
    selected: paramArray(params, PARAM_KEYS.selected)[0] === true,
    selectedBy: firstString(params, PARAM_KEYS.selectedBy),
    isIndicatorOf: stringArray(params, PARAM_KEYS.isIndicatorOf),
    vehicleTypeIris: stringArray(params, PARAM_KEYS.vehicleTypeIri),
    note: firstString(params, PARAM_KEYS.note),
  };
}

/**
 * Normalizes raw indicator metadata to ensure all fields have proper defaults
 */
function normalizeIndicatorMetadata(raw: RawIndicatorMetadata): IndicatorMetadata {
  return {
    uri: raw.uri || "",
    id: raw.id || "",
    title: raw.title || "",
    formula: raw.formula || null,
    varRoles: Array.isArray(raw.varRoles)
      ? raw.varRoles
          .filter((v): v is { uri?: string | null; title?: string | null; variableRole?: string | null } => !!v && typeof v.title === "string")
          .map((v) => ({ uri: v.uri || "", title: v.title as string, variableRole: v.variableRole || "" }))
      : [],
    dataset: raw.dataset || null,
    order: raw.order ?? 0,
    importance: raw.importance ?? 0,
    indicatorPresentationType: raw.indicatorPresentationType || "",
    groups: raw.groups || [],
    types: raw.types || [],
    detailedIndicators: raw.detailedIndicators || [],
    generalIndicators: raw.generalIndicators || [],
    leadingIndicatorRefs: raw.leadingIndicatorRefs || [],
    laggingIndicatorRefs: raw.laggingIndicatorRefs || [],
    stpaLosses: raw.stpaLosses || [],
    stpaHazards: raw.stpaHazards || [],
    stpaLossScenarios: raw.stpaLossScenarios || [],
    detailedDashboardEndpoints: raw.detailedDashboardEndpoints || [],
    params: normalizeIndicatorParams(raw.params),
    assumptions: [], // Will be populated separately by fetchStpaDescription
    stpaContext: raw.stpaContext || null, // May be in metadata in future, for now fetched separately
  };
}

/**
 * Fetches indicator metadata from the /root-dashboard/indicators endpoint
 */
export async function fetchIndicatorMetadata(
  api: ApiClient
): Promise<IndicatorMetadata[]> {
  const rawData = await api.get<RawIndicatorMetadata[]>("root-dashboard/indicators");

  // Normalize all indicators to ensure consistent data structure
  const normalizedData = rawData.map(normalizeIndicatorMetadata);
  return normalizedData;
}

/**
 * Fetches indicator metadata and enriches it with STPA descriptions
 */
export async function fetchIndicatorMetadataWithAssumptions(
  api: ApiClient
): Promise<IndicatorMetadata[]> {
  // First fetch the base metadata
  const baseMetadata = await fetchIndicatorMetadata(api);

  // Then fetch STPA descriptions for each indicator in parallel
  const metadataWithAssumptions = await Promise.all(
    baseMetadata.map(async (indicator) => {
      const stpaDescription = await fetchStpaDescription(api, indicator.uri);
      return {
        ...indicator,
        assumptions: stpaDescription.assumptions
      };
    })
  );

  return metadataWithAssumptions;
}
