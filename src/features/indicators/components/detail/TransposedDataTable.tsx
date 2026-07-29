import { formatIndicatorValue } from "../../utils/presentationType";
import { VALUE_MODES, type ValueMode } from "../../utils/valueMode";
import type { IndicatorVariables } from "../../api/indicators";
import type { TransposedColumn } from "../../utils/detailDerivations";

// Compact row labels for the known formula variables — the aligned table's
// label gutter is narrow (it matches the chart's 40px left margin), so the full
// variable name stays in the header/tooltip while the row shows a short form.
const VAR_SHORT_LABELS: Record<string, string> = {
  findings: "Find.",
  unsatisfactory: "Unsat.",
  occurrences: "Occur.",
  inspections: "Insp.",
  inspectedCondition: "Insp.cond.",
  movements: "Mvmt",
  numberOfMonths: "Months",
  constant: "Const.",
};
function shortVar(name: string): string {
  return VAR_SHORT_LABELS[name] ?? (name.length > 10 ? name.slice(0, 9) + "…" : name);
}

type TransposedDataTableProps = {
  transposed: TransposedColumn[];
  valueMode: ValueMode;
  showRedline: boolean;
  showGreenline: boolean;
  /** Human formula for the header, e.g. "constant × occurrences / movements". */
  prettyFormula: string | null;
  vars: IndicatorVariables | null;
  /** The per-indicator normalization constant, shown once in the header. */
  unitValue: number | null;
};

/**
 * Transposed (aligned) data — 12 months as columns under the chart. Column
 * widths are day-proportional and the 40px/20px label & right gutters mirror
 * the chart's left/right margins, so the columns line up with the chart above.
 */
export default function TransposedDataTable({
  transposed,
  valueMode,
  showRedline,
  showGreenline,
  prettyFormula,
  vars,
  unitValue,
}: TransposedDataTableProps) {
  // The numerator / denominator rows are labelled with the indicator's real
  // variable names (e.g. "inspections", "occurrences") instead of generic ones.
  const numeratorName = vars?.numerator || "findings";
  const denominatorName = vars?.denominator || "movements";

  return (
    <div style={{
      marginTop: 16,
      backgroundColor: "white",
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      padding: 16,
    }}>
      {/* Header: the indicator's formula, what the current mode means, and the
          per-indicator constant (fixed across months, so shown here once rather
          than in every column). In Float/Fixed the value is the ratio of the
          window's summed inputs (the Σ rows below); the constant is applied
          once, never summed. */}
      <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
        <div>
          <strong style={{ color: "#374151" }}>
            {VALUE_MODES.find(m => m.id === valueMode)?.label}
          </strong>
          {" — "}
          {VALUE_MODES.find(m => m.id === valueMode)?.hint.replace(/\.$/, "")}
          {valueMode !== "month" && "; Σ rows are that window's totals"}
          .
        </div>
        {prettyFormula && (
          <div style={{ marginTop: 4 }} title="Indicator formula">
            <strong style={{ color: "#374151" }}>Formula:</strong>{" "}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{prettyFormula}</span>
          </div>
        )}
        {vars?.constant && unitValue != null && (
          <div style={{ marginTop: 4, fontSize: 13 }} title="Normalization constant (applied once, not summed)">
            <strong style={{ color: "#1f2937" }}>{vars.constant}: {formatIndicatorValue(unitValue)}</strong>
          </div>
        )}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: `40px ${transposed.map(c => `${c.days}fr`).join(" ")} 20px`,
        rowGap: 3,
        alignItems: "center",
      }}>
        {/* Month-number header */}
        <div />
        {transposed.map((c, i) => (
          <div key={`th-${i}`} style={{ textAlign: "center", fontSize: 13, color: "#6b7280" }}>{c.monthNum}</div>
        ))}
        <div />

        {/* Divider separating the month header from the values */}
        <div style={{ gridColumn: "1 / -1", height: 1, backgroundColor: "#d1d5db", margin: "1px 0" }} />

        {/* Value row (status-colored, like the table below) */}
        <div style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: 3, fontSize: 13, fontWeight: 600, color: "#374151" }}>Value</div>
        {transposed.map((c, i) => {
          let bg = "transparent";
          if (c.value != null) {
            if (c.redline != null && c.value > c.redline) bg = "#fee2e2";
            else if (c.greenline != null && c.redline != null && c.value > c.greenline && c.value <= c.redline) bg = "#fef3c7";
          }
          return (
            <div key={`tv-${i}`} style={{ textAlign: "center", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", padding: "2px 0", backgroundColor: bg, borderRadius: 3 }}>
              {formatIndicatorValue(c.value)}
            </div>
          );
        })}
        <div />

        {/* Redline row */}
        {showRedline && (
          <>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: 3, fontSize: 13, fontWeight: 600, color: "#dc2626" }}>Red</div>
            {transposed.map((c, i) => (
              <div key={`tr-${i}`} style={{ textAlign: "center", fontSize: 14, fontVariantNumeric: "tabular-nums", padding: "2px 0", color: "#6b7280" }}>
                {c.redline != null ? formatIndicatorValue(c.redline) : "-"}
              </div>
            ))}
            <div />
          </>
        )}

        {/* Greenline row */}
        {showGreenline && (
          <>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: 3, fontSize: 13, fontWeight: 600, color: "#16a34a" }}>Green</div>
            {transposed.map((c, i) => (
              <div key={`tg-${i}`} style={{ textAlign: "center", fontSize: 14, fontVariantNumeric: "tabular-nums", padding: "2px 0", color: "#6b7280" }}>
                {c.greenline != null ? formatIndicatorValue(c.greenline) : "-"}
              </div>
            ))}
            <div />
          </>
        )}

        {/* Ratio inputs (value = numerator / denominator × constant). The
            per-month numerator/denominator rows always show the single month;
            in Float/Fixed a Σ row adds the window total the average is built
            from. Rows are labelled with the indicator's real variable names,
            shown only when the endpoint returns the inputs. */}
        {transposed.some(c => c.monthlyFindings != null || c.monthlyMovements != null || c.sumFindings != null || c.sumMovements != null) && (
          <div style={{ gridColumn: "1 / -1", height: 1, backgroundColor: "#eef0f2", margin: "1px 0" }} />
        )}

        {/* Σ numerator — sum over the averaging window (Float/Fixed) */}
        {valueMode !== "month" && transposed.some(c => c.sumFindings != null) && (
          <>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: 3, fontSize: 13, fontWeight: 600, color: "#374151" }} title={`Sum of ${numeratorName} over the averaging window`}>Σ {shortVar(numeratorName)}</div>
            {transposed.map((c, i) => (
              <div key={`tsf-${i}`} style={{ textAlign: "center", fontSize: 14, fontVariantNumeric: "tabular-nums", padding: "2px 0", color: "#6b7280" }}>
                {c.sumFindings != null ? formatIndicatorValue(c.sumFindings) : "-"}
              </div>
            ))}
            <div />
          </>
        )}

        {/* numerator — this month's count */}
        {transposed.some(c => c.monthlyFindings != null) && (
          <>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: 3, fontSize: 13, fontWeight: 600, color: "#374151" }} title={`${numeratorName} this month (ratio numerator)`}>{shortVar(numeratorName)}</div>
            {transposed.map((c, i) => (
              <div key={`tf-${i}`} style={{ textAlign: "center", fontSize: 14, fontVariantNumeric: "tabular-nums", padding: "2px 0", color: "#6b7280" }}>
                {c.monthlyFindings != null ? formatIndicatorValue(c.monthlyFindings) : "-"}
              </div>
            ))}
            <div />
          </>
        )}

        {/* Divider between the numerator group and the denominator group */}
        {transposed.some(c => c.monthlyFindings != null || c.sumFindings != null) &&
         transposed.some(c => c.monthlyMovements != null || c.sumMovements != null) && (
          <div style={{ gridColumn: "1 / -1", height: 1, backgroundColor: "#eef0f2", margin: "1px 0" }} />
        )}

        {/* Σ denominator — sum over the averaging window (Float/Fixed) */}
        {valueMode !== "month" && transposed.some(c => c.sumMovements != null) && (
          <>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: 3, fontSize: 13, fontWeight: 600, color: "#374151" }} title={`Sum of ${denominatorName} over the averaging window`}>Σ {shortVar(denominatorName)}</div>
            {transposed.map((c, i) => (
              <div key={`tsm-${i}`} style={{ textAlign: "center", fontSize: 14, fontVariantNumeric: "tabular-nums", padding: "2px 0", color: "#6b7280" }}>
                {c.sumMovements != null ? formatIndicatorValue(c.sumMovements) : "-"}
              </div>
            ))}
            <div />
          </>
        )}

        {/* denominator — this month's count */}
        {transposed.some(c => c.monthlyMovements != null) && (
          <>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: 3, fontSize: 13, fontWeight: 600, color: "#374151" }} title={`${denominatorName} this month (ratio denominator)`}>{shortVar(denominatorName)}</div>
            {transposed.map((c, i) => (
              <div key={`tm-${i}`} style={{ textAlign: "center", fontSize: 14, fontVariantNumeric: "tabular-nums", padding: "2px 0", color: "#6b7280" }}>
                {c.monthlyMovements != null ? formatIndicatorValue(c.monthlyMovements) : "-"}
              </div>
            ))}
            <div />
          </>
        )}
      </div>
    </div>
  );
}
