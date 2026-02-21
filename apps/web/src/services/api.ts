// =============================================================================
// MindLog Web — API client
// Thin wrapper around fetch. All requests go through the Vite proxy → API server.
// =============================================================================

import { API_PREFIX } from '@mindlog/shared';

class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const url = `${API_PREFIX}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await response.json()) as unknown;

  if (!response.ok) {
    const err = json as { error?: { code?: string; message?: string } };
    throw new ApiError(
      err.error?.code ?? 'UNKNOWN_ERROR',
      err.error?.message ?? 'An error occurred',
      response.status,
    );
  }

  return (json as { data: T }).data;
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body: unknown, token?: string) => request<T>('POST', path, body, token),
  patch: <T>(path: string, body: unknown, token?: string) => request<T>('PATCH', path, body, token),
  delete: <T>(path: string, token?: string) => request<T>('DELETE', path, undefined, token),
};

export { ApiError };
