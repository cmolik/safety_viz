import { ApiClient } from "@core/api/http";
import type { EventType } from "@features/inspectedConditions/store/dashboard.store";

/** Server returns:
 * [
 *   { "uri": "string", "id": "string", "title": "string" }
 * ]
 */
export type InspectionTypeDto = {
  uri: string;
  id: string;
  title: string;
};

export function mapEventTypeDto(dto: InspectionTypeDto): EventType {
  return { id: dto.id, label: dto.title };
}

export async function fetchEventTypes(api: ApiClient): Promise<EventType[]> {
  const list = await api.get<InspectionTypeDto[]>("inspection-types");
  return list.map(mapEventTypeDto);
}
