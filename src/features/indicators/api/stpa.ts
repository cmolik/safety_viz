import { ApiClient } from "@core/api/http";

/** ===== STPA Assumptions Types ===== */

export type Loss = {
  uri: string;
  code: string;
  externalCode: string;
  title: string;
};

export type Hazard = {
  uri: string;
  code: string;
  externalCode: string;
  title: string;
  losses: Loss[];
};

export type ControllerComponent = {
  uri: string;
  externalCode: string;
  title: string;
};

export type Interaction = {
  uri: string;
  externalCode: string;
  role: string;
  start: ControllerComponent;
  finishes: ControllerComponent;
  title: string;
};

export type UnsafeControlAction = {
  uri: string;
  description: string;
  code: string;
  category: string;
  hazards: Hazard[];
  interaction: Interaction;
};

export type LossScenario = {
  uri: string;
  id: string;
  externalCode: string;
  category: string;
  title: string;
  description: string;
  unsafeControlAction: UnsafeControlAction;
};

export type SystemLevelRequirement = {
  uri: string;
  id: string;
  description: string;
  lossScenarios: LossScenario[];
};

export type AssumptionType = {
  uri: string;
  id: string;
  description: string;
  assumptionType: AssumptionType | null;
  slrs: SystemLevelRequirement[];
};

export type Assumption = {
  uri: string;
  id: string;
  description: string;
  assumptionType: AssumptionType;
  slrs: SystemLevelRequirement[];
};

export type StpaDescription = {
  assumptions: Assumption[];
};

/**
 * STPA Control Structure Interaction
 * Represents a connection between elements in the control structure diagram
 */
export type StpaInteraction = {
  uri: string | null;
  interactionId: string;
  interactionLabel: string;
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  assumptionCode: string | null;
  assumptionText: string | null;
  indicator: string | null;
  indicatorText: string | null;
};

/**
 * Fetches STPA description (assumptions) for a specific indicator
 */
export async function fetchStpaDescription(
  api: ApiClient,
  uri: string
): Promise<StpaDescription> {
  const queryParams = new URLSearchParams();
  queryParams.append('uri', uri);

  const url = `root-dashboard/indicators/stpa-description?${queryParams.toString()}`;

  try {
    const data = await api.get<StpaDescription>(url);
    return data;
  } catch (error) {
    console.warn(`Failed to fetch STPA description for ${uri}:`, error);
    // Return empty assumptions if the endpoint fails
    return { assumptions: [] };
  }
}

/**
 * Fetches STPA contexts from the stpa-indicators/stpa-contexts endpoint
 * Returns an array of URI strings (currently one item for all indicators, or null)
 */
export async function fetchStpaContexts(
  api: ApiClient
): Promise<string[]> {
  try {
    const data = await api.get<string[]>("stpa-indicators/stpa-contexts");
    return data || [];
  } catch (error) {
    console.warn('Failed to fetch STPA contexts:', error);
    return [];
  }
}

/**
 * Fetches STPA control structure diagram (SVG) for a given context
 * @param stpaContext - The STPA context URI
 * @returns SVG content as string
 */
export async function fetchStpaDiagram(
  api: ApiClient,
  stpaContext: string
): Promise<string> {
  const queryParams = new URLSearchParams();
  queryParams.append('stpaContext', stpaContext);

  const url = `stpa/cs/diagram?${queryParams.toString()}`;

  try {
    // Fetch as string, API will return text since content-type is image/svg+xml
    const svg = await api.get<string>(url, {
      headers: { 'Accept': 'image/svg+xml' }
    });
    return svg;
  } catch (error) {
    console.warn(`Failed to fetch STPA diagram for context ${stpaContext}:`, error);
    return '';
  }
}

/**
 * Fetches STPA control structure interactions for a given context
 * Returns array of interaction objects that describe connections between elements
 * @param stpaContext - The STPA context URI
 * @returns Array of StpaInteraction objects
 */
export async function fetchStpaInteractions(
  api: ApiClient,
  stpaContext: string
): Promise<StpaInteraction[]> {
  const queryParams = new URLSearchParams();
  queryParams.append('stapContext', stpaContext);

  const url = `stpa-indicators/cs-assumption-indicator-cover?${queryParams.toString()}`;

  try {
    const data = await api.get<StpaInteraction[]>(url);
    return data;
  } catch (error) {
    console.warn(`Failed to fetch STPA interactions for context ${stpaContext}:`, error);
    return [];
  }
}
