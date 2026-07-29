import { useEffect, useRef } from "react";
import { toast, dismissToast, updateToast } from "./toast.store";

const defaultErrorText = (e: unknown): string =>
  String((e as Error)?.message ?? e ?? "Unknown error");

/**
 * Shows a sticky "loading" toast while `active` is true and removes it when
 * `active` goes false (or the component unmounts). Replaces an inline
 * "Loading…" message with a floating one that can't be double-shown.
 */
export function useLoadingToast(active: boolean, message: string): void {
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (active) {
      if (idRef.current == null) idRef.current = toast.loading(message);
      else updateToast(idRef.current, { message });
    } else if (idRef.current != null) {
      dismissToast(idRef.current);
      idRef.current = null;
    }
  }, [active, message]);

  // Clean up if we unmount mid-load.
  useEffect(
    () => () => {
      if (idRef.current != null) {
        dismissToast(idRef.current);
        idRef.current = null;
      }
    },
    [],
  );
}

/**
 * Shows an error toast once each time `error` becomes a new non-null value.
 * `message` may be a string or a formatter; if omitted the error's message is
 * used. Passing null/undefined (e.g. a gated condition) shows nothing.
 */
export function useErrorToast(
  error: unknown,
  message?: string | ((e: unknown) => string),
): void {
  const msgRef = useRef(message);
  msgRef.current = message;
  const shownFor = useRef<unknown>(null);

  useEffect(() => {
    if (error == null) {
      shownFor.current = null;
      return;
    }
    if (shownFor.current === error) return; // already surfaced this exact error
    shownFor.current = error;
    const m = msgRef.current;
    toast.error(typeof m === "function" ? m(error) : m ?? defaultErrorText(error));
  }, [error]);
}
