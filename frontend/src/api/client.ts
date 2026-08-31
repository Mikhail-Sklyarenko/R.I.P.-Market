import { ApiError } from './types.ts';
import {
  isRetryableHttpStatus,
  isRetryableNetworkError,
  sleep,
} from './network.ts';
import { emitAuthUnauthorized } from '../utils/api-auth-error.ts';
import { rememberSteamReturnPath } from '../utils/steam-return-path.ts';

const viteEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : undefined;
const API_BASE = viteEnv?.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  /**
   * Extra attempts after the first try on retryable network / 502–504 errors.
   * Defaults: GET → 2 (3 tries total), mutating → 0.
   */
  retries?: number;
};

function notifyUnauthorized(): void {
  if (typeof window === 'undefined') {
    return;
  }
  rememberSteamReturnPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  emitAuthUnauthorized();
}

function resolveMethod(options: RequestOptions): string {
  return options.method ?? (options.body !== undefined ? 'POST' : 'GET');
}

function defaultRetries(method: string, explicit?: number): number {
  if (explicit != null) {
    return Math.max(0, explicit);
  }
  return method === 'GET' || method === 'HEAD' ? 2 : 0;
}

async function apiRequestOnce<T>(
  path: string,
  options: RequestOptions,
  method: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (isRetryableNetworkError(error)) {
      throw error;
    }
    throw error;
  }

  const requestId = response.headers.get('X-Request-Id');
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && options.token) {
      notifyUnauthorized();
    }
    const payload = (data as { error?: import('./types').ApiErrorPayload })?.error;
    if (payload) {
      throw new ApiError({
        ...payload,
        requestId: payload.requestId ?? requestId,
      });
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

function shouldRetry(error: unknown): boolean {
  if (isRetryableNetworkError(error)) {
    return true;
  }
  if (error instanceof ApiError && isRetryableHttpStatus(error.statusCode)) {
    return true;
  }
  return false;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = resolveMethod(options);
  const retries = defaultRetries(method, options.retries);
  const attempts = retries + 1;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await apiRequestOnce<T>(path, options, method);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts - 1 && shouldRetry(error);
      if (!canRetry) {
        throw error;
      }
      await sleep(200 * (attempt + 1));
    }
  }
  throw lastError;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
