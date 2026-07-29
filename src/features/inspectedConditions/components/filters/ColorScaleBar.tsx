import type { CSSProperties } from "react";
import type { ColorScaleId } from "@features/inspectedConditions/store/dashboard.store";
import { getInterpolator } from "@lib/colorScales";

type Props = {
  scaleId: ColorScaleId;
  startLabel?: string;
  endLabel?: string;
  style?: CSSProperties;
};

export default function ColorScaleBar({ scaleId, startLabel, endLabel, style }: Props) {
  const interp = getInterpolator(scaleId as ColorScaleId);

  // CSS linear-gradient without SVG
  const stops: string[] = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const p = (i / N) * 100;
    stops.push(`${interp(i / N)} ${p}%`);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", ...style }}>
      <span style={{ fontSize: 12, color: "#111827" }}>{startLabel ?? ""}</span>
      <div style={{ height: 14, borderRadius: 4, background: `linear-gradient(to right, ${stops.join(",")})` }} />
      <span style={{ fontSize: 12, color: "#111827", textAlign: "right" }}>{endLabel ?? ""}</span>
    </div>
  );
}
