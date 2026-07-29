import type { Assumption } from "../../api/indicators";

/**
 * The indicator's STPA assumptions: each with its type, description, system
 * level requirements and their loss scenarios.
 */
export default function AssumptionsSection({ assumptions }: { assumptions: Assumption[] }) {
  return (
    <div style={{
      backgroundColor: "white",
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 16
    }}>
      <div style={{
        padding: "12px 16px",
        backgroundColor: "#f9fafb",
        borderBottom: "1px solid #e5e7eb",
        fontWeight: 600
      }}>
        Assumptions ({assumptions.length})
      </div>
      <div style={{ padding: 16 }}>
        {assumptions.map((assumption, idx) => (
          <div
            key={assumption.uri}
            style={{
              marginBottom: idx < assumptions.length - 1 ? 16 : 0,
              paddingBottom: idx < assumptions.length - 1 ? 16 : 0,
              borderBottom: idx < assumptions.length - 1 ? "1px solid #e5e7eb" : "none"
            }}
          >
            {/* Assumption Header */}
            <div style={{ marginBottom: 8 }}>
              <span style={{
                backgroundColor: "#3b82f6",
                color: "white",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                marginRight: 8
              }}>
                {assumption.id}
              </span>
              {assumption.assumptionType && (
                <span style={{
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500
                }}>
                  Type: {assumption.assumptionType.id}
                </span>
              )}
            </div>

            {/* Assumption Description */}
            <div style={{
              fontSize: 14,
              color: "#1f2937",
              marginBottom: 8,
              lineHeight: 1.5
            }}>
              {assumption.description}
            </div>

            {/* Assumption Type Description */}
            {assumption.assumptionType && assumption.assumptionType.description && (
              <div style={{
                fontSize: 13,
                color: "#6b7280",
                fontStyle: "italic",
                marginBottom: 8,
                paddingLeft: 12,
                borderLeft: "3px solid #e5e7eb",
                lineHeight: 1.5
              }}>
                {assumption.assumptionType.description}
              </div>
            )}

            {/* System Level Requirements */}
            {assumption.slrs.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: 6
                }}>
                  System Level Requirements:
                </div>
                {assumption.slrs.map((slr) => (
                  <div
                    key={slr.uri}
                    style={{
                      marginBottom: 8,
                      paddingLeft: 12,
                      borderLeft: "2px solid #3b82f6"
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#1f2937", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{slr.id}:</span> {slr.description}
                    </div>

                    {/* Loss Scenarios */}
                    {slr.lossScenarios.length > 0 && (
                      <div style={{ marginTop: 6, paddingLeft: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                          Loss Scenarios:
                        </div>
                        {slr.lossScenarios.map((ls) => (
                          <div
                            key={ls.uri}
                            style={{
                              fontSize: 12,
                              color: "#4b5563",
                              marginBottom: 6,
                              backgroundColor: "#f9fafb",
                              padding: 8,
                              borderRadius: 4
                            }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>
                              {ls.id} - {ls.title}
                            </div>
                            <div style={{ marginBottom: 4 }}>{ls.description}</div>
                            {ls.unsafeControlAction && (
                              <div style={{ fontSize: 11, color: "#6b7280" }}>
                                UCA: {ls.unsafeControlAction.code} - {ls.unsafeControlAction.description}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
