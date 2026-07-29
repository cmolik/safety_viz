import { useEffect, useMemo, useRef, useCallback, useState, useLayoutEffect } from "react";
import * as d3 from "d3";
import {
  useDashboardStore,
  useEvents,
  useTimeFilter,
  useVisualization,
  useColorScale,
  PresetTimeFilter,
  type GeoJSONFeature,
  type DashboardData,
  VisualizationMode,
  useEventTypesAll,
  useChartScaleToFiltered,
} from "../store/dashboard.store";
import { useEventFilter } from "../hooks/useEventFilter";
import { getFeatureTypeId, makeInTime } from "../utils/featureAccess";
import { getHighlightColor } from "../utils/highlight";
import { getInterpolator, colorByType as colorByTypeInDomain } from "@lib/colorScales";

function useElementSize(el: HTMLElement | null) {
  const [sz, setSz] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!el) return;

    const update = (w: number, h: number) =>
      setSz((p) => (p.w === w && p.h === h ? p : { w, h }));

    // initialization
    const r0 = el.getBoundingClientRect();
    update(Math.round(r0.width), Math.round(r0.height));

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== el) continue;

        // prefer contentBoxSize (newer), fallback to contentRect
        const cbs = entry.contentBoxSize;
        if (cbs) {
          // Firefox gives an array, Chromium an object
          const box = Array.isArray(cbs) ? cbs[0] : cbs;
          update(Math.round(box.inlineSize), Math.round(box.blockSize));
        } else {
          const { width, height } = entry.contentRect;
          update(Math.round(width), Math.round(height));
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return sz;
}

function useFilteredEvents(): GeoJSONFeature[] {
  const events = useEvents();
  const matchesFilters = useEventFilter({ undatedPasses: false, applyPosition: true });
  return useMemo(() => (events ?? []).filter(matchesFilters), [events, matchesFilters]);
}

type RectDatum = {
  id: string | number;
  day: Date;
  idx: number;
  typeName: string;
  typeId: string;
  dateMs: number;
  highlighted: boolean;
};

type Mode = "add" | "toggle" | "replace";
const pickMode = (ev: MouseEvent): Mode =>
  ev.ctrlKey || ev.metaKey ? "add" : ev.shiftKey ? "add" : "toggle";

// Below this rendered cell height (px), drop the white border so dense days read
// as a solid column instead of a stack of hairlines.
const MIN_CELL_BORDER_H = 3;

export default function DayChartPanel() {
  const data = useFilteredEvents();
  const visualization = useVisualization();
  const colorScaleId = useColorScale();
  const allTypes = useDashboardStore((s) => s.filters.eventTypes.all);
  const allTypesForRects = useEventTypesAll();
  const labelToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of allTypesForRects) m.set(t.label, t.id);
    return m;
  }, [allTypesForRects]);

  const setData = useDashboardStore((s) => s.setData);
  const clearHighlighted = useDashboardStore((s) => s.clearHighlighted);

  // dimensions and d3 groups
  const hostRef = useRef<HTMLDivElement>(null);
  const gHitRef = useRef<SVGRectElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gChartRef = useRef<SVGGElement | null>(null);
  const gXRef = useRef<SVGGElement | null>(null);
  const gYRef = useRef<SVGGElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // margins + labels in 2 rows = more space at the bottom
  const margin = { top: 8, right: 8, bottom: 34, left: 32 };

  // colors for "By type"
  const typeDomain = useMemo(() => allTypes.map((t) => t.id), [allTypes]);
  const colorByType = useCallback(
    (id: string) => colorByTypeInDomain(id, typeDomain),
    [typeDomain]
  );

  // time window for X axis
  const time = useTimeFilter();
  const now = useMemo(() => Date.now(), []);
  const [startMs, endMs] = useMemo<[number, number]>(() => {
    if (time.preset === PresetTimeFilter.Custom && time.start && time.end) {
      return [new Date(time.start).getTime(), new Date(time.end).getTime()];
    }
    if (time.preset === PresetTimeFilter.Past7Days) return [now - 7 * 24 * 3600_000, now];
    if (time.preset === PresetTimeFilter.Past30Days) return [now - 30 * 24 * 3600_000, now];
    if (data.length) {
      const ext = d3.extent(data, (d) => new Date(d.properties.date).getTime());
      if (ext[0] != null && ext[1] != null) return [ext[0], ext[1]];
    }
    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).getTime();
    const t1 = today.getTime();
    return [t0, t1];
  }, [time.preset, time.start, time.end, data, now]);

  const startRef = useRef(startMs);
  const endRef   = useRef(endMs);

  // rects (stack index per day)
  const rects = useMemo<RectDatum[]>(() => {
    if (!data.length) return [];
    const byDay = d3.group(data, (f) => +d3.timeDay.floor(new Date(f.properties.date)));
    const out: RectDatum[] = [];
    for (const [dayNum, list] of byDay) {
      const dayList = list.slice().sort((a, b) => {
        const an = a.properties.name,
          bn = b.properties.name;
        if (an < bn) return -1;
        if (an > bn) return 1;
        return String(a.properties.id).localeCompare(String(b.properties.id));
      });
      dayList.forEach((f, i) => {
        out.push({
          id: f.properties.id,
          day: new Date(Number(dayNum)),
          idx: i,
          typeName: f.properties.name,
          typeId: getFeatureTypeId(f, labelToId),
          dateMs: new Date(f.properties.date).getTime(),
          highlighted: !!f.properties.highlighted,
        });
      });
    }
    return out;
  }, [data, labelToId]);
  

  // Y-axis maximum. "Only filtered" (chartScaleToFiltered) scales to the busiest
  // day among the filtered rows shown in the table/map; otherwise it scales to
  // the busiest day overall in the range, ignoring the active filters, so the
  // filtered bars read as a fraction of the total.
  const allEvents = useDashboardStore((s) => s.data.events);
  const scaleToFiltered = useChartScaleToFiltered();
  const yMax = useMemo(() => {
    const maxDailyCount = (events: GeoJSONFeature[]) => {
      if (!events.length) return 0;
      const counts = d3.rollup(
        events,
        (v) => v.length,
        (f) => +d3.timeDay.floor(new Date(f.properties.date))
      );
      return counts.size ? d3.max(counts.values()) ?? 0 : 0;
    };

    if (scaleToFiltered) {
      return Math.max(1, maxDailyCount(data));
    }
    const inTime = makeInTime(time, now, false);
    return Math.max(1, maxDailyCount(allEvents.filter((f) => inTime(f.properties.date))));
  }, [scaleToFiltered, data, allEvents, time, now]);

  const highlightColor = getHighlightColor(visualization, colorScaleId);

  // Interpolator used by heatmap mode — each cell is colored per stack level in
  // renderAll (color = count at that height, normalized to the y-axis max).
  const heatInterp = useMemo(() => getInterpolator(colorScaleId), [colorScaleId]);

  // coloring for by-time / by-type (heatmap is colored per-cell in renderAll)
  const colorOf = useMemo<((ms: number, type: string) => string)>(() => {
    if (visualization === VisualizationMode.Time) {
      const interp = getInterpolator(colorScaleId);
      const s = startMs,
        e = endMs;
      const span = Math.max(1, e - s);
      return (ms: number, type: string) => {
        void type;
        return interp(Math.max(0, Math.min(1, (ms - s) / span)));
      };
    }
    return (_ms: number, type: string) => colorByType(type);
  }, [visualization, colorScaleId, startMs, endMs, colorByType]);

  const getDims = () => {
    const width  = size.w || 300;
    const height = size.h || 200;
    const innerW = Math.max(0, width  - margin.left - margin.right);
    const innerH = Math.max(0, height - margin.top  - margin.bottom);
    return { width, height, innerW, innerH };
  };

  const makeScales = (
    innerW: number,
    innerH: number,
    domainStartMs?: number,
    domainEndMs?: number
  ) => {
    const sMs = domainStartMs ?? startMs;
    const eMs = domainEndMs   ?? endMs;

    const x = d3
      .scaleTime()
      .domain([d3.timeDay.floor(new Date(sMs)), d3.timeDay.ceil(new Date(eMs))])
      .range([0, innerW]);

    const dayCount = Math.max(1, d3.timeDay.count(x.domain()[0], x.domain()[1]));
    const binW = innerW / dayCount;

    const y = d3.scaleLinear().domain([0, yMax]).range([innerH, 0]);
    const hOf = (i0: number, i1: number) => Math.max(1, y(i0) - y(i1));

    return { x, y, binW, dayCount, hOf };
  };

  const onTickContextMenu = (evt: unknown, d: Date) => {
    const e = evt as MouseEvent;
    e.preventDefault();
    const mode = pickMode(e);
    const dayStart = +d3.timeDay.floor(d);
    const idsInDay = new Set(
      data
        .filter((f) => +d3.timeDay.floor(new Date(f.properties.date)) === dayStart)
        .map((f) => String(f.properties.id))
    );
    setData((st: DashboardData) => ({
      ...st,
      events: st.events.map((x: GeoJSONFeature) => {
        const inside = idsInDay.has(String(x.properties.id));
        let highlighted = !!x.properties.highlighted;
        if (mode === "replace") highlighted = inside;
        else if (mode === "add") highlighted = highlighted || inside;
        else if (mode === "toggle") highlighted = inside ? !highlighted : highlighted;
        return { ...x, properties: { ...x.properties, highlighted } };
      }),
    }));
  };

  const renderAll = () => {
    if (!hostRef.current || !svgRef.current || !gChartRef.current || !gXRef.current || !gYRef.current) return;

    const { width, height, innerW, innerH } = getDims();

    if (innerW <= 0 || innerH <= 0) return;

    d3.select(svgRef.current).attr("width", width).attr("height", height);

    // groups
    const gChart = d3.select(gChartRef.current).attr("transform", `translate(${margin.left},${margin.top})`);
    const gX = d3.select(gXRef.current).attr("transform", `translate(${margin.left},${height - margin.bottom})`);
    const gY = d3.select(gYRef.current).attr("transform", `translate(${margin.left},${margin.top})`);

    // scales and axes
    const { x, y, binW } = makeScales(innerW, innerH);
    // Pixel-snap each cell's top/bottom to integer boundaries so stacked cells
    // tile exactly. Without this, sub-pixel positions on dense days overlap and
    // their anti-aliased edges blend into light/dark banding.
    const cellTop = (i: number) => Math.round(y(i + 1));
    const cellHeight = (i: number) => Math.max(0, Math.round(y(i)) - Math.round(y(i + 1)));
    const xAxis = d3.axisBottom<Date>(x).ticks(d3.timeDay.every(1));
    const yAxis = d3.axisLeft(y).ticks(Math.min(6, yMax));

    gX.call(xAxis);
    gY.call(yAxis);

    // X labels (2 lines / short)
    const fmtDay2 = (d: Date) =>
      new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(d).slice(0, 2);
    const fmtDM = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;

    if (binW >= 28) {
      gX.selectAll<SVGTextElement, Date>(".tick text")
        .text((d) => `${fmtDay2(d)}|${fmtDM(d)}`)
        .each(function () {
          const text = d3.select(this);
          const [l1, l2] = (text.text() || "").split("|");
          text.text(null);
          text.append("tspan").attr("x", 0).text(l1);
          text.append("tspan").attr("x", 0).attr("dy", "1.1em").text(l2);
        })
        .attr("text-anchor", "middle")
        .style("cursor", "pointer")
        .attr("transform", `translate(${binW * 0.5},0)`);
    } else {
      gX.selectAll<SVGTextElement, Date>(".tick text")
        .text((d) => `${fmtDay2(d)} ${fmtDM(d)}`)
        .attr("text-anchor", "middle")
        .style("cursor", "pointer")
        .attr("transform", `translate(${binW * 0.5},0)`);
    }

    // click + contextmenu on ticks
    gX.selectAll<SVGGElement, Date>(".tick")
      .on("contextmenu", onTickContextMenu);

    d3.select(gHitRef.current)
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerW)
      .attr("height", innerH)
      .on("contextmenu", (evt) => {
        const mode = pickMode(evt as unknown as MouseEvent);
        if (mode !== "add") {
          clearHighlighted();
        }
      });

    // join of rectangles
    gChart
      .selectAll<SVGRectElement, RectDatum>("rect.cell")
      .data(rects, (d) => String((d as RectDatum).id))
      .join(
        (enter) =>
          enter
            .append("rect")
            .attr("class", "cell")
            .attr("rx", 0)
            .attr("ry", 0)
            .style("cursor", "pointer")
            .on("contextmenu", (evt, d) => {
              // right click: replace/add/toggle depending on keys
              evt.preventDefault();
              const mode = pickMode(evt as unknown as MouseEvent);
              setData((st: DashboardData) => ({
                ...st,
                events: st.events.map((x: GeoJSONFeature) => {
                  const isTarget = String(x.properties.id) === String(d.id);
                  if (mode === "replace") {
                    return {
                      ...x,
                      properties: { ...x.properties, highlighted: isTarget },
                    };
                  }
                  if (mode === "add") {
                    return isTarget
                      ? { ...x, properties: { ...x.properties, highlighted: true } }
                      : x;
                  }
                  // toggle
                  return isTarget
                    ? { ...x, properties: { ...x.properties, highlighted: !x.properties.highlighted } }
                    : x;
                }),
              }));
            }),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("x", (d) => x(d.day))
      .attr("y", (d) => cellTop(d.idx))
      .attr("width", Math.max(1, binW - 1))
      .attr("height", (d) => cellHeight(d.idx))
      .attr("fill", (d) =>
        visualization === VisualizationMode.Heatmap
          ? heatInterp(Math.min(1, (d.idx + 1) / yMax))
          : colorOf(d.dateMs, d.typeId)
      )
      // Drop the border on thin cells so a dense day reads as a solid column.
      .attr("stroke", (d) => (cellHeight(d.idx) >= MIN_CELL_BORDER_H ? "white" : "none"))
      .attr("stroke-width", (d) => (cellHeight(d.idx) >= MIN_CELL_BORDER_H ? 1 : 0));

  const dotR = (d: RectDatum) =>
    Math.max(2, Math.min(6, Math.min(binW, cellHeight(d.idx)) / 3));

  d3.select(gChartRef.current)
    .selectAll<SVGCircleElement, RectDatum>("circle.hl")
    .data(rects.filter((d) => d.highlighted), (d) => String((d as RectDatum).id))
    .join(
      (enter) => enter.append("circle").attr("class", "hl"),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr("cx", (d) => x(d.day) + Math.max(1, binW - 1) / 2)
    .attr("cy", (d) => cellTop(d.idx) + cellHeight(d.idx) / 2)
    .attr("r", dotR)
    .attr("fill", highlightColor)
    .attr("stroke", "white")
    .attr("stroke-width", 1.5)
    .style("pointer-events", "none")
    .raise();
    };

    useEffect(() => {
      startRef.current = startMs;
      endRef.current   = endMs;
    }, [startMs, endMs]);

    useEffect(() => {
    if (!hostRef.current) return;
    const panelBody = hostRef.current.closest(".panel-body") as HTMLElement | null;
    containerRef.current = panelBody ?? hostRef.current.parentElement ?? hostRef.current;
  }, []);

  const size = useElementSize(containerRef.current);

  useEffect(() => {
    if (!hostRef.current || svgRef.current) return;

    const svg = d3.select(hostRef.current).append("svg");
    const gChart = svg.append("g");
    const gX = svg.append("g");
    const gY = svg.append("g");

    const gHit = gChart
      .insert("rect", ":first-child")
      .attr("class", "hit-bg")
      .attr("fill", "transparent")
      .style("pointer-events", "all");
    gHitRef.current = gHit.node();

    svgRef.current = svg.node();
    gChartRef.current = gChart.node();
    gXRef.current = gX.node();
    gYRef.current = gY.node();
  }, []);


  useLayoutEffect(() => {
  if (!svgRef.current) return;
  const { innerW, innerH } = getDims();
  if (innerW <= 0 || innerH <= 0) return;
  renderAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [size.w, size.h, rects, yMax, startMs, endMs, visualization, colorScaleId]);


  useEffect(() => {
    if (!svgRef.current) return;
    renderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rects, yMax, startMs, endMs, visualization, colorScaleId]);

  /** Turn off native context menu in the chart area (we have our own right-click) */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const prevent = (e: MouseEvent) => e.preventDefault();
    host.addEventListener("contextmenu", prevent);
    return () => host.removeEventListener("contextmenu", prevent);
  }, []);

  return (
    <div ref={hostRef} className="no-drag" style={{ position: "absolute", inset: 0 }} />
  );
}
