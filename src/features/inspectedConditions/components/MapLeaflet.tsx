import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Pane,
  LayersControl,
  useMap,
  useMapEvent,
} from "react-leaflet";
import {
  circleMarker,
  canvas,
  layerGroup,
  latLngBounds,
  point,
  rectangle,
  type Rectangle,
  type LeafletMouseEvent,
  type Canvas,
  type LayerGroup,
  type Map as LeafletMap,
  type LatLng,
  type LatLngBoundsExpression,
} from "leaflet";

import {
  useDashboardStore,
  useEvents,
  useTimeFilter,
  useVisualization,
  useColorScale,
  useHeatRadius,
  PresetTimeFilter,
  type GeoJSONFeature,
  type DashboardData,
  VisualizationMode,
} from "../store/dashboard.store";
import { useEventFilter } from "../hooks/useEventFilter";
import { getFeatureTypeId } from "../utils/featureAccess";
import { getHighlightColor } from "../utils/highlight";
import { loadHeatLayer } from "../utils/heatLayer";
import type { HeatLayer as LeafletHeatLayer } from "leaflet";

import { getInterpolator, colorByType, interpolatorToHeatGradient } from "@lib/colorScales";
import { lastNDaysRangeISO, formatCZ } from "@lib/date";

// public API via ref 
export type MapLeafletHandle = {
  fitToFilteredPoints: () => void;
  fitToInitBounds: () => void;
};

// constants 
const { BaseLayer, Overlay } = LayersControl;
const SUB = "abcd";
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const INIT_BOUNDS: LatLngBoundsExpression = [
  [50.1060249316125, 14.215373248744413],
  [50.086197347923, 14.304187584294212],
];

// components used inside MapLeaflet
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 0);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [map]);
  return null;
}
function MapReady({ onReady }: { onReady: (m: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => onReady(map), [map, onReady]);
  return null;
}

// data & colors from store
function useFilteredPoints(): GeoJSONFeature[] {
  const events = useEvents();
  // Map draws only geo points, so it opts out of the position rule and keeps
  // undated features (undatedPasses); PointsLayer skips those without geometry.
  const matchesFilters = useEventFilter({ undatedPasses: true, applyPosition: false });
  return useMemo(() => (events ?? []).filter(matchesFilters), [events, matchesFilters]);
}

function usePointColor(): (f: GeoJSONFeature) => string {
  const visualization = useVisualization();
  const colorScaleId = useColorScale();
  const time = useTimeFilter();
  const allTypes = useDashboardStore((s) => s.filters.eventTypes.all);
  const domain = useMemo(() => allTypes.map(t => t.id), [allTypes]);
  const now = useMemo(() => Date.now(), []);
  const labelToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of allTypes) m.set(t.label, t.id);
    return m;
  }, [allTypes]);

  return useMemo(() => {
    if (visualization === VisualizationMode.Time) {
      const interp = getInterpolator(colorScaleId);
      let startISO: string | undefined, endISO: string | undefined;

      if (time.preset === PresetTimeFilter.Custom && time.start && time.end) {
        startISO = time.start; endISO = time.end;
      } else if (time.preset === PresetTimeFilter.Past7Days) {
        ({ startISO, endISO } = lastNDaysRangeISO(7, now));
      } else if (time.preset === PresetTimeFilter.Past30Days) {
        ({ startISO, endISO } = lastNDaysRangeISO(30, now));
      }

      const s = startISO ? new Date(startISO).getTime() : NaN;
      const e = endISO   ? new Date(endISO).getTime()   : NaN;
      if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) {
        return () => "#999";
      }
      const scale = (t: number) => {
        const x = Math.max(0, Math.min(1, (t - s) / (e - s)));
        return interp(x);
      };
      return (f: GeoJSONFeature) => scale(new Date(f.properties.date).getTime());
    }
    return (f: GeoJSONFeature) => {
      const typeId = getFeatureTypeId(f, labelToId);
      return colorByType(typeId, domain);
    };
  }, [visualization, colorScaleId, time.preset, time.start, time.end, domain, now, labelToId]);
}

// points layer
function PointsLayer({
  data,
  colorOf,
  highlightColor,
  zoomAdaptive = true,
  hollow = false,
}: {
  data: GeoJSONFeature[];
  colorOf: (f: GeoJSONFeature) => string;
  highlightColor: string;
  zoomAdaptive?: boolean;
  /** Draw only the ring (transparent fill) so the layer beneath — e.g. the
   *  heatmap — stays visible through each point. */
  hollow?: boolean;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const setData = useDashboardStore((s) => s.setData);
  const layerRef = useRef<LayerGroup | null>(null);
  const rendererRef = useRef<Canvas | null>(null);
  const isSelecting = useRef<boolean>(false);

  useMapEvent("zoomend", () => setZoom(map.getZoom()));

  // Track box selection state
  useEffect(() => {
    const container = map.getContainer();

    const observer = new MutationObserver(() => {
      isSelecting.current = container.classList.contains("box-selecting");
    });

    observer.observe(container, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [map]);

  // Remove the marker group + renderer from the map when this layer unmounts
  // (e.g. switching to heatmap), otherwise its circles linger over the heat.
  useEffect(() => {
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      if (rendererRef.current) {
        map.removeLayer(rendererRef.current);
        rendererRef.current = null;
      }
    };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) {
      rendererRef.current = canvas({ padding: 0.5 });
      layerRef.current = layerGroup().addTo(map);
    }
    const group = layerRef.current!;
    group.clearLayers();

    const radiusForZoom = (z: number) =>
      zoomAdaptive ? Math.max(2, Math.round(1 + (z - 8) * 0.8)) : 3;

    for (const f of data) {
      // Skip features without geometry
      if (!f.geometry || !f.geometry.coordinates) {
        continue;
      }

      const [lon, lat] = f.geometry.coordinates;
      const isHi = !!f.properties.highlighted;

      const marker = circleMarker([lat, lon], {
        renderer: rendererRef.current ?? undefined,
        radius: radiusForZoom(zoom),
        color: isHi ? highlightColor : "white",
        weight: isHi ? 2 : 1,
        fillColor: colorOf(f),
        fillOpacity: hollow ? 0 : 0.9,
        pane: "points",
      });

      const html = `
        <div>
          <strong>${f.properties.name}</strong><br/>
          ${formatCZ(f.properties.date) ?? ""}<br/>
          ${lat.toFixed(5)}, ${lon.toFixed(5)}
        </div>
      `;
      marker.bindTooltip(html, {
        direction: "top",
        sticky: true,
        opacity: 0.95,
        className: "point-tooltip",
      });

      marker.on("mouseover", () => {
        marker.setStyle({ weight: isHi ? 3 : 2 });
        marker.openTooltip();
      });
      marker.on("mouseout", () => {
        // Don't close tooltip if we're in box selection mode
        if (isSelecting.current) {
          return;
        }
        marker.setStyle({ weight: isHi ? 2 : 1 });
        marker.closeTooltip();
      });

      marker.on("click", () => {
        setData((st: DashboardData) => ({
          ...st,
          events: st.events.map((x: GeoJSONFeature) =>
            String(x.properties.id) === String(f.properties.id)
              ? { ...x, properties: { ...x.properties, highlighted: !x.properties.highlighted } }
              : x
          ),
        }));
      });

      marker.addTo(group);
    }
  }, [data, colorOf, highlightColor, map, zoom, zoomAdaptive, hollow, setData]);

  return null;
}

// Reference zoom at which the heatmap radius equals its configured base value.
const HEAT_REF_ZOOM = 12;

/**
 * Effective heat radius (px) for a zoom level. Scaling the radius with zoom
 * keeps a roughly constant geographic footprint, so the heat doesn't shrink to
 * dots when zooming in or merge into one blob when zooming out. The 0.5 exponent
 * makes it a gentle half-step per zoom level; clamped so it stays usable.
 */
function heatRadiusForZoom(base: number, zoom: number): number {
  const r = base * Math.pow(2, (zoom - HEAT_REF_ZOOM) * 0.5);
  return Math.max(2, Math.min(80, r));
}

// ---- Heatmap look tunables — tweak these to experiment ----
// Blur as a fraction of the (zoom-scaled) radius. Higher = softer, cloudier
// blobs; lower = crisper, more dot-like.
const HEAT_BLUR_FACTOR = 0.6;
// Overall intensity. >1 makes the map hotter (it saturates the top of the
// gradient sooner); <1 cools it down. Implemented by scaling the `max` the
// gradient tops out at, so it works even with the auto-computed max.
const HEAT_INTENSITY = 1;
// Base heat each record contributes before identical coordinates are summed.
// NOTE: with the auto-max below, scaling *every* point by the same weight
// cancels out (max scales too) — this knob only bites when weights differ per
// point (weight by a field) or when you pin a fixed max.
const HEAT_POINT_WEIGHT = 1;
// Opacity of the faintest cells (0..1).
const HEAT_MIN_OPACITY = 0.4;

// Blur (px) for a given effective radius.
const heatBlurForRadius = (r: number) => Math.max(1, r * HEAT_BLUR_FACTOR);

// Density heat layer (leaflet.heat), aggregated by identical coordinate so
// overlapping points (e.g. SI-2) read as hotter spots.
function HeatLayer({
  data,
  gradient,
  radius,
}: {
  data: GeoJSONFeature[];
  gradient: Record<number, string>;
  radius: number;
}) {
  const map = useMap();
  const layerRef = useRef<LeafletHeatLayer | null>(null);
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvent("zoomend", () => setZoom(map.getZoom()));

  const effRadius = heatRadiusForZoom(radius, zoom);
  // Keep the latest radius available to the (rarely-rebuilt) build effect below
  // without making it a dependency, so zoom/size changes only re-tune options.
  const effRadiusRef = useRef(effRadius);
  effRadiusRef.current = effRadius;

  // Build (or rebuild) the layer when the data or gradient change.
  useEffect(() => {
    const agg = new Map<string, [number, number, number]>(); // key → [lat, lon, weight]
    for (const f of data) {
      if (!f.geometry || !f.geometry.coordinates) continue;
      const [lon, lat] = f.geometry.coordinates;
      if (lon === 0 && lat === 0) continue;
      const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
      const cur = agg.get(key);
      if (cur) cur[2] += HEAT_POINT_WEIGHT;
      else agg.set(key, [lat, lon, HEAT_POINT_WEIGHT]);
    }
    const heatPoints = Array.from(agg.values());
    const rawMax = heatPoints.reduce((m, p) => Math.max(m, p[2]), HEAT_POINT_WEIGHT);
    // Intensity tops the gradient out at a lower value → hotter overall.
    const max = Math.max(0.01, rawMax / HEAT_INTENSITY);
    const r = effRadiusRef.current;

    let cancelled = false;
    loadHeatLayer()
      .then((heatLayer) => {
        if (cancelled) return;
        if (layerRef.current) {
          map.removeLayer(layerRef.current);
          layerRef.current = null;
        }
        const layer = heatLayer(heatPoints, {
          radius: r,
          blur: heatBlurForRadius(r),
          max,
          minOpacity: HEAT_MIN_OPACITY,
          gradient,
        });
        layer.addTo(map);
        layerRef.current = layer;
      })
      .catch((e) => console.error("Failed to load heat layer:", e));

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [data, gradient, map]);

  // Re-tune radius/blur on zoom or size change without a full rebuild.
  useEffect(() => {
    layerRef.current?.setOptions({ radius: effRadius, blur: heatBlurForRadius(effRadius) });
  }, [effRadius]);

  return null;
}

// main component
const MapLeaflet = forwardRef<MapLeafletHandle>(function MapLeaflet(_, ref) {
  const points = useFilteredPoints();
  const colorOf = usePointColor();
  const setData = useDashboardStore((s) => s.setData);

  const visualization = useVisualization();
  const colorScaleId = useColorScale();
  const isHeatmap = visualization === VisualizationMode.Heatmap;
  const highlightColor = getHighlightColor(visualization, colorScaleId);
  const heatRadius = useHeatRadius();
  const heatGradient = useMemo(
    () => interpolatorToHeatGradient(getInterpolator(colorScaleId)),
    [colorScaleId]
  );

  // In heatmap mode the density field hides individual points, so we still draw
  // the *selected* ones on top — that's how a selection made in the table, day
  // chart, or by right-drag box-select becomes visible on the map.
  const selectedPoints = useMemo(
    () => points.filter((f) => f.properties.highlighted && f.geometry?.coordinates),
    [points]
  );

  const center = useMemo<[number, number]>(() => {
    const pointsWithGeometry = points.filter(f => f.geometry && f.geometry.coordinates);
    if (pointsWithGeometry.length) {
      const s = pointsWithGeometry.reduce<[number, number]>(
        (acc, f) => [acc[0] + f.geometry!.coordinates[1], acc[1] + f.geometry!.coordinates[0]],
        [0, 0]
      );
      return [s[0] / pointsWithGeometry.length, s[1] / pointsWithGeometry.length];
    }
    return [50.08804, 14.42076];
  }, [points]);

  const [map, setMap] = useState<LeafletMap | null>(null);

  // initial fit to bounds
  useEffect(() => {
    if (!map) return;
    map.fitBounds(INIT_BOUNDS, { padding: [16, 16] });
    setTimeout(() => map.invalidateSize(), 0);
  }, [map]);

//  - Right drag without key: replace
//  - Right drag + Shift:     add
//  - Right drag + Ctrl/Cmd:  toggle
useEffect(() => {
  // Right-drag box selection works in every mode, including heatmap: the points
  // aren't drawn there, but selecting an area still highlights the underlying
  // features, which then appear via the selected-points overlay.
  if (!map) return;

  const container = map.getContainer();
  const boxRectRef = { current: null as Rectangle | null };
  const startRef   = { current: null as LatLng | null };
  const selecting  = { current: false };
  const modeRef    = { current: "replace" as "add" | "toggle" | "replace" };

  // Disable native contextmenu (to avoid interference with right-drag)
  const preventContext = (e: MouseEvent) => e.preventDefault();

  const onDown = (e: LeafletMouseEvent) => {
    const ev = e.originalEvent as MouseEvent;

    // Only right button
    if (ev.button !== 2) return;

    // mode according to modifiers
    if (ev.shiftKey) modeRef.current = "add";
    else if (ev.ctrlKey || ev.metaKey) modeRef.current = "toggle";
    else modeRef.current = "replace";

    selecting.current = true;
    map.dragging.disable();
    container.classList.add("box-selecting");
    ev.preventDefault();

    startRef.current = e.latlng;
    boxRectRef.current = rectangle(latLngBounds(e.latlng, e.latlng), {
      color: "#2563eb",
      weight: 1,
      dashArray: "4,3",
      fillColor: "#60a5fa",
      fillOpacity: 0.15,
      interactive: false,
      pane: "overlayPane",
    }).addTo(map);
  };

  const onMove = (e: LeafletMouseEvent) => {
    if (!selecting.current || !boxRectRef.current || !startRef.current) return;
    boxRectRef.current.setBounds(latLngBounds(startRef.current, e.latlng));
  };

  const finish = () => {
    if (!selecting.current) return;
    selecting.current = false;
    map.dragging.enable();
    container.classList.remove("box-selecting");

    const rect = boxRectRef.current;
    boxRectRef.current = null;
    startRef.current = null;
    if (!rect) return;

    const bounds = rect.getBounds();
    rect.remove();

    const idsIn = new Set(
      points
        .filter((f) => f.geometry && f.geometry.coordinates && bounds.contains([f.geometry.coordinates[1], f.geometry.coordinates[0]]))
        .map((f) => String(f.properties.id))
    );

    const mode = modeRef.current;
    setData((st: DashboardData) => ({
      ...st,
      events: st.events.map((x: GeoJSONFeature) => {
        const id = String(x.properties.id);
        const inside = idsIn.has(id);
        let highlighted = !!x.properties.highlighted;

        if (mode === "replace") highlighted = inside;
        else if (mode === "add") highlighted = highlighted || inside;
        else if (mode === "toggle") highlighted = inside ? !highlighted : highlighted;

        return { ...x, properties: { ...x.properties, highlighted } };
      }),
    }));
  };

  map.on("mousedown", onDown);
  map.on("mousemove", onMove);
  map.on("mouseup", finish);

  // when releasing outside the map
  const onDocUp = () => finish();
  document.addEventListener("mouseup", onDocUp);

  // disable contextmenu on the map
  container.addEventListener("contextmenu", preventContext);

  return () => {
    map.off("mousedown", onDown);
    map.off("mousemove", onMove);
    map.off("mouseup", finish);
    document.removeEventListener("mouseup", onDocUp);
    container.removeEventListener("contextmenu", preventContext);
    if (boxRectRef.current) { boxRectRef.current.remove(); boxRectRef.current = null; }
    map.dragging.enable();
    container.classList.remove("box-selecting");
  };
}, [map, points, setData]);
  // methods for external control
  useImperativeHandle(
    ref,
    () => ({
      fitToInitBounds() {
        if (!map) return;
        map.fitBounds(INIT_BOUNDS, { padding: [16, 16] });
      },
      fitToFilteredPoints() {
        if (!map) return;

        const pointsWithGeometry = points.filter(f => f.geometry && f.geometry.coordinates);
        if (!pointsWithGeometry.length) {
          map.fitBounds(INIT_BOUNDS, { padding: [16, 16] });
          return;
        }

        const b = latLngBounds(
          pointsWithGeometry.map((f) => [f.geometry!.coordinates[1], f.geometry!.coordinates[0]] as [number, number])
        );

        const padded = b.pad(0.1);
        const padPt  = point(16, 16);
        const zFit   = map.getBoundsZoom(padded, true, padPt);
        const z      = Math.min(map.getMaxZoom(), zFit - 1);

        map.setView(padded.getCenter(), z);
      },
    }),
    [map, points]
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }} className="no-drag">
      <MapContainer
        center={center}
        zoom={12}
        minZoom={3}
        maxZoom={19}
        style={{ width: "100%", height: "100%" }}
        preferCanvas
        zoomAnimation
      >
        <MapReady onReady={setMap} />
        <InvalidateOnResize />

        <LayersControl position="topright">
          <BaseLayer checked name="CARTO Positron (light)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              subdomains={SUB}
              className="labels-tiles"
              tileSize={256}
              attribution={CARTO_ATTR}
            />
          </BaseLayer>

          <BaseLayer name="OpenStreetMap">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              tileSize={256}
              className="labels-tiles"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            />
          </BaseLayer>

          <BaseLayer name="CARTO Dark Matter">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains={SUB}
              className="labels-tiles"
              tileSize={256}
              attribution={CARTO_ATTR}
            />
          </BaseLayer>

          <Overlay name="Labels" checked>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
              subdomains={SUB}
              tileSize={256}
              className="labels-tiles"
              zIndex={550}
              attribution={CARTO_ATTR}
            />
          </Overlay>
        </LayersControl>

        {isHeatmap ? (
          <>
            <HeatLayer data={points} gradient={heatGradient} radius={heatRadius} />
            {/* Draw only the selected points over the heat so table/chart/box
                selections stay visible; unselected points remain hidden. The
                hollow ring keeps the heat visible through each point. */}
            <Pane name="points" style={{ zIndex: 700 }}>
              <PointsLayer data={selectedPoints} colorOf={colorOf} highlightColor={highlightColor} zoomAdaptive hollow />
            </Pane>
          </>
        ) : (
          <Pane name="points" style={{ zIndex: 700 }}>
            <PointsLayer data={points} colorOf={colorOf} highlightColor={highlightColor} zoomAdaptive />
          </Pane>
        )}
      </MapContainer>
    </div>
  );
});

export default MapLeaflet;
