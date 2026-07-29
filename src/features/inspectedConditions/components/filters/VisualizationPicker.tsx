import { useMemo } from "react";
import ColorScaleBar from "./ColorScaleBar";
import { useDashboardStore, PresetTimeFilter } from "@features/inspectedConditions/store/dashboard.store";
import { VisualizationMode, type ColorScaleId } from "@features/inspectedConditions/store/dashboard.store";
import { formatCZ, lastNDaysRangeISO } from "@lib/date";
import { COLOR_SCALE_OPTIONS } from "@lib/colorScales";

export default function VisualizationPicker() {
  const visualization = useDashboardStore((s) => s.filters.visualization);
  const colorScale = useDashboardStore((s) => s.filters.colorScale);
  const time = useDashboardStore((s) => s.filters.time);
  const heatRadius = useDashboardStore((s) => s.heatRadius);

  const setVisualization = useDashboardStore((s) => s.setVisualization);
  const setColorScale = useDashboardStore((s) => s.setColorScale);
  const setHeatRadius = useDashboardStore((s) => s.setHeatRadius);

  const now = useMemo(() => Date.now(), []);

  const [startLabel, endLabel] = useMemo(() => {
    if (time.preset === PresetTimeFilter.Custom && time.start && time.end) {
      return [formatCZ(time.start), formatCZ(time.end)] as const;
    }
    const days = time.preset === PresetTimeFilter.Past7Days ? 7
               : time.preset === PresetTimeFilter.Past30Days ? 30
               : 0;
    if (!days) return ["", ""] as const;
    const { startISO, endISO } = lastNDaysRangeISO(days, now);
    return [formatCZ(startISO), formatCZ(endISO)] as const;
  }, [time.preset, time.start, time.end, now]);

  return (
    <div className="block">
      <div className="filterHeader" style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Visualization type</div>

      <div className="change-name-time" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          <input
            type="radio"
            name="visualization"
            value="time"
            checked={visualization === VisualizationMode.Time}
            onChange={() => setVisualization(VisualizationMode.Time)}
          />
          <span> By time</span>
        </label>

        <label>
          <input
            type="radio"
            name="visualization"
            value="type"
            checked={visualization === VisualizationMode.Type}
            onChange={() => setVisualization(VisualizationMode.Type)}
          />
          <span> By type</span>
        </label>

        <label>
          <input
            type="radio"
            name="visualization"
            value="heatmap"
            checked={visualization === VisualizationMode.Heatmap}
            onChange={() => setVisualization(VisualizationMode.Heatmap)}
          />
          <span> Heatmap</span>
        </label>

        {/* Heatmap size sits right next to the radio and only when heatmap is on. */}
        {visualization === VisualizationMode.Heatmap && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <label htmlFor="heat-radius">Size:</label>
            <input
              id="heat-radius"
              type="range"
              min={2}
              max={50}
              step={1}
              value={heatRadius}
              onChange={(e) => setHeatRadius(Number(e.target.value))}
              style={{ width: 90 }}
            />
            <span style={{ width: 22, textAlign: "right" }}>{heatRadius}</span>
          </span>
        )}
      </div>

      {/* Color scale — label + dropdown + bar on one line. Shown for every mode;
          Heatmap shows low/high, "By time" shows the date extent, "By type" has
          no gradient meaning so the ends are left unlabelled. */}
      <div
        className="color-scale-selector"
        style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}
      >
        <span className="center-label" style={{ whiteSpace: "nowrap" }}>Color Scale:</span>
        <select
          value={colorScale}
          onChange={(e) => setColorScale(e.target.value as ColorScaleId)}
        >
          {COLOR_SCALE_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k.replace("interpolate", "")}
            </option>
          ))}
        </select>
        <ColorScaleBar
          style={{ flex: 1 }}
          scaleId={colorScale as ColorScaleId}
          startLabel={
            visualization === VisualizationMode.Heatmap
              ? "low"
              : visualization === VisualizationMode.Type
              ? ""
              : startLabel
          }
          endLabel={
            visualization === VisualizationMode.Heatmap
              ? "high"
              : visualization === VisualizationMode.Type
              ? ""
              : endLabel
          }
        />
      </div>
    </div>
  );
}
