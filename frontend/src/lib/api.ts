/**
 * Thin fetch wrapper around the FastAPI backend.
 *
 * Requests go to a same-origin /api path that Vite proxies to the backend, so
 * the httpOnly session cookie is sent without any cross-site cookie setup.
 */

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  fieldErrors: { field: string; message: string }[];

  constructor(
    message: string,
    status: number,
    fieldErrors: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
};

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

/** Listeners fired when the API reports that the session is gone. */
const unauthorizedHandlers = new Set<() => void>();

export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params, signal } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(
      "Cannot reach the server. Check that the backend is running on port 8010.",
      0,
    );
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    // Only signal a lost session for endpoints that require one - the login
    // form's own 401 is a normal wrong-password response, not a logout.
    if (response.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/signup")) {
      unauthorizedHandlers.forEach((handler) => handler());
    }

    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail: unknown }).detail
        : typeof payload === "string"
          ? payload
          : null;

    const fieldErrors =
      payload && typeof payload === "object" && "errors" in payload
        ? ((payload as { errors: { field: string; message: string }[] }).errors ?? [])
        : [];

    throw new ApiError(
      typeof detail === "string" && detail ? detail : `Request failed (${response.status})`,
      response.status,
      fieldErrors,
    );
  }

  return payload as T;
}

export const api = {
  get: <T,>(path: string, params?: RequestOptions["params"], signal?: AbortSignal) =>
    apiRequest<T>(path, { method: "GET", params, signal }),
  post: <T,>(path: string, body?: unknown, params?: RequestOptions["params"]) =>
    apiRequest<T>(path, { method: "POST", body, params }),
  patch: <T,>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  put: <T,>(path: string, body?: unknown, params?: RequestOptions["params"]) =>
    apiRequest<T>(path, { method: "PUT", body, params }),
  delete: <T,>(path: string, params?: RequestOptions["params"]) =>
    apiRequest<T>(path, { method: "DELETE", params }),
};

/** Triggers a browser download for one of the CSV export endpoints. */
export function downloadCsv(
  path: string,
  filename: string,
  params?: RequestOptions["params"],
): void {
  const link = document.createElement("a");
  link.href = buildUrl(path, params);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
