import { useEffect, useRef, useState } from "react";
import { useToastStore, dismissToast, type Toast, type ToastKind } from "./toast.store";

/** Per-kind visual style: light background, colored accent, dark text. */
const KIND_STYLE: Record<ToastKind, { bg: string; border: string; fg: string; accent: string }> = {
  info:    { bg: "#eff6ff", border: "#bfdbfe", fg: "#1e3a8a", accent: "#3b82f6" },
  success: { bg: "#ecfdf5", border: "#a7f3d0", fg: "#065f46", accent: "#10b981" },
  error:   { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b", accent: "#ef4444" },
  loading: { bg: "#f9fafb", border: "#e5e7eb", fg: "#374151", accent: "#9ca3af" },
};

function KindIcon({ kind, color }: { kind: ToastKind; color: string }) {
  if (kind === "loading") {
    return (
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          borderTopColor: "transparent",
          animation: "toast-spin 0.7s linear infinite",
          display: "inline-block",
          flex: "none",
        }}
      />
    );
  }
  const glyph = kind === "error" ? "!" : kind === "success" ? "✓" : "i";
  return (
    <span
      aria-hidden
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: "16px",
        textAlign: "center",
        flex: "none",
      }}
    >
      {glyph}
    </span>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const style = KIND_STYLE[toast.kind];
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Auto-dismiss after `duration`, paused while hovered. Sticky when duration=0.
  useEffect(() => {
    if (toast.duration <= 0 || hovered) return;
    timerRef.current = window.setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.duration, toast.message, hovered]);

  return (
    <div
      role="status"
      onClick={() => dismissToast(toast.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        minWidth: 240,
        maxWidth: 360,
        padding: "10px 12px",
        background: style.bg,
        color: style.fg,
        border: `1px solid ${style.border}`,
        borderLeft: `4px solid ${style.accent}`,
        borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        cursor: "pointer",
        animation: "toast-in 0.18s ease-out",
      }}
    >
      <div style={{ marginTop: 1 }}>
        <KindIcon kind={toast.kind} color={style.accent} />
      </div>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.35, wordBreak: "break-word" }}>
        {toast.message}
      </div>
      {toast.duration !== 0 || toast.kind !== "loading" ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            dismissToast(toast.id);
          }}
          style={{
            flex: "none",
            border: "none",
            background: "transparent",
            color: style.fg,
            opacity: 0.6,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

/**
 * Renders the floating toast stack (top-right). Mount once near the app root.
 * The container ignores pointer events so it never blocks the UI beneath;
 * individual toasts re-enable them so they stay clickable.
 */
export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
