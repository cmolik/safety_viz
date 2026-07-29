/** Default request timeout. The backend aggregates large datasets per request,
 *  so this is deliberately generous (2 minutes). */
export const DEFAULT_TIMEOUT_MS = 120_000;

export type ApiClientOptions = {
  baseUrl?: string;                   
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;                 
};

// Specific error for timeout
export class ApiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiTimeoutError";
  }
}


export class ApiClient {
  private baseUrl?: string;
  private defaultHeaders: Record<string, string>;
  private timeoutMs: number;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = opts.baseUrl;

    this.defaultHeaders = {
      Accept: "application/json",
      ...(opts.defaultHeaders ?? {}),
    };

    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...init, method: "GET" });
  }

  async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "POST",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  /** `delete` is a reserved word, hence `del`. Body is optional (most DELETEs
   *  identify the resource through the query string). */
  async del<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: "DELETE",
      headers: body != null ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = this.baseUrl ? new URL(path, this.baseUrl).toString() : path;

    const timeoutController = new AbortController();
    const id = setTimeout(() => timeoutController.abort(), this.timeoutMs);

    // Combine the timeout signal with any caller-provided signal (e.g. for cancellation).
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...this.defaultHeaders, ...(init.headers ?? {}) },
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
      }
      // if 204, no body
      if (res.status === 204) return undefined as unknown as T;

      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        return (await res.json()) as T;
      }
      // fallback: text
      return (await res.text()) as unknown as T;
      } catch (err: unknown) {
        // A timeout is our own ApiTimeoutError; a caller-triggered cancellation
        // (external signal) surfaces as-is so callers can detect it.
        if (timeoutController.signal.aborted) {
          throw new ApiTimeoutError(`Request timed out after ${this.timeoutMs} ms`);
        }
      throw err;
    } finally {
      clearTimeout(id);
    }
  }
}
