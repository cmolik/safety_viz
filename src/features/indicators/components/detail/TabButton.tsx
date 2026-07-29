import type { ReactNode } from "react";

/**
 * Chrome-style detail tab: the active tab is taller, white, outlined blue on
 * top/left/right; inactive tabs are grey and draw a blue bottom baseline. Only
 * the top padding changes so the bottom edge (the baseline) never shifts.
 */
export default function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: active ? "13px 8px 8px" : "8px",
        backgroundColor: active ? "white" : "#f3f4f6",
        color: active ? "#3b82f6" : "#6b7280",
        fontSize: 12,
        fontWeight: active ? 700 : 600,
        cursor: "pointer",
        transition: `border-color 0.15s, opacity 0.15s, box-shadow 0.15s, padding 0.15s ${active ? "0s" : "0.15s"}`,
        borderStyle: "solid",
        borderWidth: 2,
        borderTopColor: active ? "#3b82f6" : "transparent",
        borderLeftColor: active ? "#3b82f6" : "transparent",
        borderRightColor: active ? "#3b82f6" : "transparent",
        borderBottomColor: active ? "transparent" : "#3b82f6",
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        opacity: active ? 1 : 0.85,
        boxShadow: active ? "0 -1px 4px rgba(0,0,0,0.12)" : "none",
      }}
    >
      {children}
    </button>
  );
}
