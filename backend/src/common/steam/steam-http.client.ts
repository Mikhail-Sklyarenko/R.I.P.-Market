import {
  ProxyAgent,
  fetch as undiciFetch,
  type RequestInit as UndiciRequestInit,
  type Response as UndiciResponse,
} from 'undici';

export const STEAM_HTTP_PROXY_ENV = 'STEAM_HTTP_PROXY';

let cachedProxyUrl: string | null | undefined;
let cachedAgent: ProxyAgent | null = null;

/**
 * Residential / HTTP proxy for all server-side Steam egress.
 * Example (DataImpulse): http://LOGIN:PASSWORD@gw.dataimpulse.com:823
 */
export function getSteamHttpProxyUrl(): string | null {
  const raw = process.env[STEAM_HTTP_PROXY_ENV]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function isSteamHttpProxyConfigured(): boolean {
  return getSteamHttpProxyUrl() !== null;
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

/** Test helper — clears cached ProxyAgent after env changes. */
export function resetSteamHttpClientForTests(): void {
  cachedProxyUrl = undefined;
  if (cachedAgent) {
    void cachedAgent.close().catch(() => undefined);
  }
  cachedAgent = null;
}

/**
 * fetch() for Steam / Steam Web API. Uses STEAM_HTTP_PROXY when set.
 */
export async function steamFetch(
  input: string | URL,
  init: UndiciRequestInit = {},
): Promise<UndiciResponse> {
  const agent = getProxyAgent();
  if (!agent) {
    return undiciFetch(input, init);
  }
  return undiciFetch(input, {
    ...init,
    dispatcher: agent,
  });
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
