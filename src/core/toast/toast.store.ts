import { create } from "zustand";

export type ToastKind = "info" | "success" | "error" | "loading";

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  /** Auto-dismiss delay in ms; 0 = sticky (dismiss only on interaction / code). */
  duration: number;
};

type ToastState = {
  toasts: Toast[];
  add: (t: Toast) => void;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<Omit<Toast, "id">>) => void;
  clear: () => void;
};

/** Store is intentionally thin — timers live in the host component. */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (t) => set((s) => ({ toasts: [...s.toasts, t] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  update: (id, patch) =>
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  clear: () => set({ toasts: [] }),
}));

/** Default auto-dismiss per kind. Errors linger; loading never self-dismisses. */
const DEFAULT_DURATION: Record<ToastKind, number> = {
  info: 4000,
  success: 3000,
  error: 8000,
  loading: 0,
};

let seq = 0;
const genId = () => `toast_${Date.now().toString(36)}_${seq++}`;

/**
 * Show a toast and return its id. Callable from anywhere (components, hooks,
 * even the API layer) since it writes to the store imperatively.
 */
export function showToast(input: { kind: ToastKind; message: string; duration?: number }): string {
  const id = genId();
  useToastStore.getState().add({
    id,
    kind: input.kind,
    message: input.message,
    duration: input.duration ?? DEFAULT_DURATION[input.kind],
  });
  return id;
}

export const dismissToast = (id: string) => useToastStore.getState().remove(id);
export const updateToast = (id: string, patch: Partial<Omit<Toast, "id">>) =>
  useToastStore.getState().update(id, patch);
export const clearToasts = () => useToastStore.getState().clear();

/** Convenience API. `loading` returns an id to dismiss/update when done. */
export const toast = {
  info: (message: string, duration?: number) => showToast({ kind: "info", message, duration }),
  success: (message: string, duration?: number) => showToast({ kind: "success", message, duration }),
  error: (message: string, duration?: number) => showToast({ kind: "error", message, duration }),
  loading: (message: string) => showToast({ kind: "loading", message, duration: 0 }),
};
