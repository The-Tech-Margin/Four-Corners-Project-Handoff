/**
 * The browser's only way to reach the server: this app's own routes.
 * Nothing in the browser talks to a database, an object store or a
 * provider — that is what keeps the integrations swappable.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers:
      init.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  const body = await parse(response);

  if (!response.ok) {
    const detail = body as { error?: string; code?: string } | null;
    throw new ApiError(
      detail?.error || `Request failed (${response.status})`,
      response.status,
      detail?.code,
    );
  }

  return body as T;
}

export const apiGet = <T>(path: string): Promise<T> => apiFetch<T>(path);

export const apiSend = <T>(path: string, method: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
