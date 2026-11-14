export class ApiError extends Error {
  status: number;
  /** Parsed JSON error body, when the server sent one. */
  body?: any;
  constructor(message: string, status: number, body?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Sent on every request. The Flask backend rejects state-changing requests
 * without it (CSRF defence: a cross-site page cannot add a custom header
 * without a CORS preflight, which the backend never grants).
 */
export const CSRF_HEADERS = { 'X-Requested-With': 'ultimate-ui' } as const;

interface RequestOptions extends RequestInit {
  signal?: AbortSignal;
}

async function request<T>(url: string, options?: RequestOptions): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...CSRF_HEADERS,
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    // The backend answers errors as {"error": "...", "message": "..."}; show
    // that text instead of the raw JSON.
    let parsed: any;
    try {
      parsed = JSON.parse(errorBody);
    } catch {
      parsed = undefined;
    }
    const readable =
      (typeof parsed?.error === 'string' && parsed.error) ||
      (typeof parsed?.message === 'string' && parsed.message) ||
      errorBody;
    throw new ApiError(
      readable || `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      parsed
    );
  }
  const ct = response.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    return response.json();
  }
  return response.text() as unknown as T;
}

export const api = {
  get: <T>(url: string, opts?: { signal?: AbortSignal }) =>
    request<T>(url, { signal: opts?.signal }),
  post: <T>(url: string, data?: unknown, opts?: { signal?: AbortSignal }) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(data ?? {}), signal: opts?.signal }),
  put: <T>(url: string, data?: unknown, opts?: { signal?: AbortSignal }) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(data ?? {}), signal: opts?.signal }),
  delete: <T>(url: string, opts?: { signal?: AbortSignal }) =>
    request<T>(url, { method: 'DELETE', signal: opts?.signal }),
};

export interface BackendConfig {
  webepg: { url: string; timeout: number };
  ultimate_backend: { url: string; public_url: string; timeout: number };
  ui: { theme: string; refresh_interval: number; timezone: string };
  player: {
    default_size: string;
    default_bitrate: string;
    autoplay?: boolean;
    muted?: boolean;
    default_volume?: number;
  };
  database: { retention_days: number };
  catchup: { max_hours: number };
}

export function getConfig(): BackendConfig {
  return (
    (window as any).__ULTIMATE_CONFIG__ ?? {
      webepg: { url: '', timeout: 10 },
      ultimate_backend: { url: '', public_url: '', timeout: 10 },
      ui: { theme: 'dark', refresh_interval: 300, timezone: 'Europe/Berlin' },
      player: { default_size: 'medium', default_bitrate: 'auto' },
      database: { retention_days: 7 },
      catchup: { max_hours: 168 },
    }
  );
}
