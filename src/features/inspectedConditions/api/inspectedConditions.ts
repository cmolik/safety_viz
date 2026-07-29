import type { GeoJSONFeature } from "@features/inspectedConditions";
import type { EventType } from "@features/inspectedConditions/store/dashboard.store";
import { ApiClient } from "@core/api/http";
import { parseWktPoint } from "@lib/geo";

export type InspectedConditionDto = {
  uri: string;
  discrepancyId: string;
  inspectionId: string;
  inspectionStart: number | string;  // ms timestamp or ISO
  inspectionEnd?: number | string;
  discrepancyDate?: number | string;
  repairDate?: number | string;
  state?: string;
  priorityValue?: string;
  priorityTitle?: string;
  inspectionCategory?: string;
  inspectionTypeId: string;
  inspectionType: string;            
  repairedImmediately?: string;
  conditionTypeId?: string;
  conditionType?: string;
  sectionId?: string;
  section?: string;
  conditionWkt?: string;
  wkt: string;                       // "POINT(14.2430566 50.1057158)"
  operator?: string;
  fixedBy?: string;
};


// number (ms) / ISO string to ISO string
export function toIsoDate(value: number | string): string {
  if (typeof value === "number") return new Date(value).toISOString();
  const t = Date.parse(value);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

// id from crypto.randomUUID (browser) with fallback
function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // fallback: very simple uid
  return "evt_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// lookup label by inspectionTypeId; fallback to inspectionType
export function resolveName(dto: InspectedConditionDto, eventTypes: EventType[] | undefined): string {
  const label = eventTypes?.find((t) => t.id === dto.inspectionTypeId)?.label;
  return label ?? dto.inspectionType ?? dto.inspectionTypeId ?? "Unknown";
}

const mapOne = (dto: InspectedConditionDto, eventTypes?: EventType[]): GeoJSONFeature => {
  const coords = parseWktPoint(dto.wkt);
  const dateIso = toIsoDate(dto.inspectionStart);
  const name = resolveName(dto, eventTypes);

  return {
    type: "Feature",
    properties: {
      id: genId(),
      name,
      typeId: dto.inspectionTypeId,
      date: dateIso,
      highlighted: false,
      selected: false,
      raw: dto as unknown as Record<string, unknown>,
    },
    geometry: coords ? { type: "Point", coordinates: coords } : null, // [lon, lat] or null if no coordinates
  };
}

// main fetch function: returns features + missing EventType (to be added to store)
export async function fetchInspectedConditions(
  api: ApiClient,
  eventTypes: EventType[] = [],
  startDate?: string,
  endDate?: string,
  opts?: { signal?: AbortSignal },
): Promise<{ events: GeoJSONFeature[]; missingEventTypes: EventType[] }> {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);

  const url = params.toString()
    ? `inspected-conditions/data?${params.toString()}`
    : "inspected-conditions/data";

  const raw = await api.get<InspectedConditionDto[]>(url, { signal: opts?.signal });
  const knownIds = new Set(eventTypes.map((t) => t.id));
  const missingMap = new Map<string, EventType>();

  const events = raw
    .map((dto) => {
      // collect missing types by inspectionTypeId
      if (dto.inspectionTypeId && !knownIds.has(dto.inspectionTypeId)) {
        // label taken from dto.inspectionType (fallback to id)
        missingMap.set(dto.inspectionTypeId, {
          id: dto.inspectionTypeId,
          label: (dto.inspectionType ?? dto.inspectionTypeId) + "(M)",
        });
      }
      return mapOne(dto, eventTypes);
    });
    // No longer filter out items - include all events even without coordinates

  return { events, missingEventTypes: Array.from(missingMap.values()) };
}

/**
 * Row from /root-dashboard/indicators/data (the new indicator-data endpoint).
 * A different, flatter shape than InspectedConditionDto: the category is
 * `discrepancyType` / `inspectedCondition` (e.g. "typ-nalezu-3"), the point is
 * in `wkt`, and the time is `inspectionStart`. Many rows can share an
 * inspectionId (one per finding). Not linked to the inspection-types catalog.
 */
export type IndicatorDataDto = {
  uri: string | null;
  inspectionId: string | null;
  inspectionStart: number | string | null;  // ms timestamp or ISO
  organizationName: string | null;
  inspectionNotes: string | null;
  inspectionPlace: string | null;
  inspectedCondition: string | null;         // condition/finding type
  discrepancyId: string | null;
  minutes: number | null;
  count: number | null;
  vehicleType: string | null;
  discrepancyNote: string | null;
  wkt: string | null;                        // "POINT(lon lat)"
  discrepancyType: string | null;            // same finding-type id as inspectedCondition
};

/**
 * Raw fields, in priority order, that map to a row's category ("event type").
 * `mapIndicatorDatum` reads the first filled one. The per-column filter UI
 * excludes these so they aren't offered a second time as generic string filters
 * (the "Filter by Event Type" control already covers them). Keep in sync with
 * the category derivation in `mapIndicatorDatum`.
 */
export const CATEGORY_SOURCE_FIELDS = ["discrepancyType", "inspectedCondition"] as const;

function firstFilled(dto: IndicatorDataDto, fields: readonly string[]): string | null {
  for (const f of fields) {
    const v = (dto as unknown as Record<string, unknown>)[f];
    if (v != null && v !== "") return String(v);
  }
  return null;
}

// Page size we *request*. The backend may silently cap responses below this, so
// termination must not assume pages come back this long (see the loop below).
const INDICATOR_DATA_PAGE_SIZE = 2000;
// First page number — the backend is 0-based (page=0 is the first page).
const INDICATOR_DATA_FIRST_PAGE = 0;
// Safety valve so a mis-paged backend can't loop forever.
const INDICATOR_DATA_MAX_PAGES = 1000;

function mapIndicatorDatum(dto: IndicatorDataDto): GeoJSONFeature {
  const coords = dto.wkt ? parseWktPoint(dto.wkt) : null;
  const dateIso = dto.inspectionStart != null ? toIsoDate(dto.inspectionStart) : new Date().toISOString();
  // The finding type is the category we group / filter / color by. The data has
  // no human-readable title, so the id doubles as the label.
  const category = firstFilled(dto, CATEGORY_SOURCE_FIELDS) ?? "Unknown";

  return {
    type: "Feature",
    properties: {
      id: genId(),
      name: category,
      typeId: category,
      date: dateIso,
      highlighted: false,
      selected: false,
      raw: dto as unknown as Record<string, unknown>,
    },
    geometry: coords ? { type: "Point", coordinates: coords } : null,
  };
}

/**
 * Fetches an indicator's conditions from /root-dashboard/indicators/data, paging
 * until the backend runs out of rows. Types are derived from the data (this
 * endpoint isn't connected to the inspection-types catalog).
 *
 * The backend returns variable-sized pages — often fewer than the requested
 * `pageSize`, and not consistently — so a short (under-`pageSize`) page does NOT
 * mean it's the last one. The only reliable end signal is an empty page, so we
 * keep paging until one comes back with zero rows (bounded by MAX_PAGES).
 */
export async function fetchIndicatorConditions(
  api: ApiClient,
  indicatorUri: string,
  startDate?: string,
  endDate?: string,
  opts?: { signal?: AbortSignal },
): Promise<{ events: GeoJSONFeature[]; missingEventTypes: EventType[] }> {
  const raw: IndicatorDataDto[] = [];

  for (let page = INDICATOR_DATA_FIRST_PAGE; ; page++) {
    const params = new URLSearchParams();
    params.append('uri', indicatorUri);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('pageSize', String(INDICATOR_DATA_PAGE_SIZE));
    params.append('page', String(page));

    const chunk = await api.get<IndicatorDataDto[]>(
      `root-dashboard/indicators/data?${params.toString()}`,
      { signal: opts?.signal },
    );
    // Variable-sized pages: a short page is NOT the end (the backend under-fills
    // pages inconsistently). Only an empty page means there are no more rows.
    if (!Array.isArray(chunk) || chunk.length === 0) break;

    raw.push(...chunk);

    // Safety valve so a mis-paged backend can't loop forever.
    if (page - INDICATOR_DATA_FIRST_PAGE >= INDICATOR_DATA_MAX_PAGES) break;
  }

  const events = raw.map(mapIndicatorDatum);
  return { events, missingEventTypes: [] };
}
