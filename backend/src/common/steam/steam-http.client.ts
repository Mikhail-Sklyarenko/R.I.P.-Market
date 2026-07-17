import {
  ProxyAgent,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
  type Response as UndiciResponse,
} from 'undici';

export const STEAM_HTTP_PROXY_ENV = 'STEAM_HTTP_PROXY';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;

let cachedProxyUrl: string | null | undefined;
let cachedAgent: ProxyAgent | null = null;

/**
 * Residential / HTTP proxy for server-side Steam egress.
 * Example (DataImpulse): http://LOGIN:PASSWORD@gw.dataimpulse.com:823
 */
export function getSteamHttpProxyUrl(): string | null {
  const raw = process.env[STEAM_HTTP_PROXY_ENV]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function isSteamHttpProxyConfigured(): boolean {
  return getSteamHttpProxyUrl() !== null;
}

function getHostname(input: string | URL): string {
  try {
    return (typeof input === 'string' ? new URL(input) : input).hostname;
  } catch {
    return '';
  }
}

/** Community hosts need residential egress; Web API often works direct from VPS. */
export function shouldUseSteamProxy(input: string | URL): boolean {
  if (!isSteamHttpProxyConfigured()) {
    return false;
  }
  if (process.env.STEAM_HTTP_PROXY_ALL === 'true') {
    return true;
  }
  const host = getHostname(input);
  return (
    host === 'steamcommunity.com' ||
    host.endsWith('.steamcommunity.com')
  );
}

function getProxyAgent(): ProxyAgent | null {
  const proxyUrl = getSteamHttpProxyUrl();
  if (!proxyUrl) {
    cachedProxyUrl = null;
    cachedAgent = null;
    return null;
  }
  if (cachedAgent && cachedProxyUrl === proxyUrl) {
    return cachedAgent;
  }
  cachedProxyUrl = proxyUrl;
  cachedAgent = new ProxyAgent(proxyUrl);
  return cachedAgent;
}

function resetProxyAgent(): void {
  if (cachedAgent) {
    void cachedAgent.close().catch(() => undefined);
  }
  cachedAgent = null;
  cachedProxyUrl = undefined;
}

/** Test helper — clears cached ProxyAgent after env changes. */
export function resetSteamHttpClientForTests(): void {
  resetProxyAgent();
}

function isTransientFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  if (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('socket') ||
    message.includes('aborted')
  ) {
    return true;
  }
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return isTransientFetchError(cause);
  }
  return false;
}

function withTimeoutSignal(
  init: UndiciRequestInit,
  timeoutMs: number,
): { init: UndiciRequestInit; cancel: () => void } {
  if (init.signal) {
    return { init, cancel: () => undefined };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    init: { ...init, signal: controller.signal },
    cancel: () => clearTimeout(timer),
  };
}

async function steamFetchOnce(
  input: string | URL,
  init: UndiciRequestInit,
  useProxy: boolean,
): Promise<UndiciResponse> {
  const timeoutMs = Number(process.env.STEAM_HTTP_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const { init: timedInit, cancel } = withTimeoutSignal(
    init,
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  );
  try {
    if (!useProxy) {
      return await undiciFetch(input, timedInit);
    }
    const agent = getProxyAgent();
    if (!agent) {
      return await undiciFetch(input, timedInit);
    }
    return await undiciFetch(input, {
      ...timedInit,
      dispatcher: agent,
    });
  } finally {
    cancel();
  }
}

/**
 * fetch() for Steam / Steam Web API.
 * - steamcommunity.com → STEAM_HTTP_PROXY when set
 * - api.steampowered.com → direct by default (set STEAM_HTTP_PROXY_ALL=true to force proxy)
 * Retries transient proxy/network failures.
 */
export async function steamFetch(
  input: string | URL,
  init: UndiciRequestInit = {},
): Promise<UndiciResponse> {
  const useProxy = shouldUseSteamProxy(input);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await steamFetchOnce(input, init, useProxy);
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt === MAX_ATTEMPTS) {
        break;
      }
      if (useProxy) {
        resetProxyAgent();
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Steam HTTP request failed');
}

export async function steamFetchText(
  input: string | URL,
  init: UndiciRequestInit = {},
): Promise<{ status: number; body: string }> {
  const response = await steamFetch(input, init);
  return {
    status: response.status,
    body: await response.text(),
  };
}

export async function steamFetchJson<T>(
  input: string | URL,
  init: UndiciRequestInit = {},
): Promise<{ status: number; body: T | null }> {
  const response = await steamFetch(input, init);
  let body: T | null = null;
  try {
    body = (await response.json()) as T;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}
