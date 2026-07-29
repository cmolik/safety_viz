// Session-scoped IndexedDB storage adapter for Zustand `persist`.
//
// Why IndexedDB: the indicators store persists per-indicator overview + 6-year
// history data. At ~60 indicators this easily exceeds sessionStorage's ~5 MB
// quota (which throws QuotaExceededError); IndexedDB is effectively unbounded
// for our sizes.
//
// Why session-scoped: we want to keep sessionStorage's semantics — a refresh
// restores state, but a *new browser tab/window* starts fresh. Every record is
// namespaced by a per-tab session id held in sessionStorage: a refresh reuses it
// (state restored), a new tab/window gets a new id (no record → empty state).
// Records from closed sessions are garbage-collected by TTL on startup.
//
// Resilience: if IndexedDB (or sessionStorage) is unavailable or errors, every
// operation degrades to a no-op / null so persistence is best-effort and never
// breaks the app.

import type { StateStorage } from "zustand/middleware";

const DB_NAME = "safety-viz";
const STORE_NAME = "persist";
const SESSION_KEY = "safety-viz-session-id";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // GC records untouched for 24h

type StoredRecord = { value: string; touched: number };

/** Per-tab id: survives refresh (sessionStorage), fresh per new tab/window. */
function resolveSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "volatile"; // sessionStorage blocked — degrade to a single bucket
  }
}

const sessionId = resolveSessionId();
const recordKey = (name: string) => `${name}::${sessionId}`;

let dbPromise: Promise<IDBDatabase | null> | null = null;
function getDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return getDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

// Drop records from sessions other than this tab's that haven't been touched
// within the TTL — keeps IndexedDB from accumulating dead tab sessions. Runs
// once, fire-and-forget; never blocks startup.
void getDb().then((db) => {
  if (!db) return;
  try {
    const cursorReq = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const rec = cursor.value as StoredRecord | undefined;
      const isCurrentSession = String(cursor.key).endsWith(`::${sessionId}`);
      const stale = !rec || typeof rec.touched !== "number" || Date.now() - rec.touched > SESSION_TTL_MS;
      if (!isCurrentSession && stale) cursor.delete();
      cursor.continue();
    };
  } catch {
    /* ignore GC failures */
  }
});

export const idbSessionStorage: StateStorage = {
  getItem: (name) =>
    withStore<StoredRecord>("readonly", (s) => s.get(recordKey(name))).then((r) => (r ? r.value : null)),
  setItem: (name, value) =>
    withStore("readwrite", (s) =>
      s.put({ value, touched: Date.now() } satisfies StoredRecord, recordKey(name)),
    ).then(() => undefined),
  removeItem: (name) =>
    withStore("readwrite", (s) => s.delete(recordKey(name))).then(() => undefined),
};
