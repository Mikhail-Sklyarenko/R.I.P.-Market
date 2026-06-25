import { ApiError, type ApiErrorPayload } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const requestId = response.headers.get('X-Request-Id');
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const payload = (data as { error?: ApiErrorPayload })?.error;
    if (payload) {
      throw new ApiError({ ...payload, requestId: payload.requestId ?? requestId });
    }
    throw new ApiError({
      code: 'UNKNOWN_ERROR',
      message: `Request failed with status ${response.status}`,
      statusCode: response.status,
      requestId,
    });
  }

  return data as T;
}
