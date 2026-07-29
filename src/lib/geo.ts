// src/lib/geo.ts

/** Parse WKT POINT format: "POINT(14.2430566 50.1057158)" */
export function parseWktPoint(wkt?: string): [number, number] | null {
  if (!wkt) return null;
  // accept "POINT(14.2430566 50.1057158)" even with spaces
  const m = wkt.trim().match(/^POINT\s*\(\s*([+-]?\d+(\.\d+)?)\s+([+-]?\d+(\.\d+)?)\s*\)$/i);
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[3]);
  if (Number.isNaN(lon) || Number.isNaN(lat)) return null;
  return [lon, lat];
}

