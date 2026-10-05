/** Temporary token is sent only to fixed Steam HTTPS endpoints, never a proxy. */
export async function steamTokenRead(
  method: 'GetTokenDetails' | 'GetTradeOffer' | 'GetTradeStatus',
  token: string,
  params: Record<string, string> = {},
): Promise<{ status: number; data: unknown }> {
  const service =
    method === 'GetTokenDetails' ? 'ISteamUserOAuth' : 'IEconService';
  const url = new URL(`https://api.steampowered.com/${service}/${method}/v1/`);
  url.searchParams.set('access_token', token);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  try {
    // Direct HTTPS only: no configured third-party Steam proxy or redirects.
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, data: null };
    }
    const reader = response.body?.getReader();
    if (!reader) return { status: response.status, data: null };
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 262144) {
          await reader.cancel();
          return { status: response.status, data: null };
        }
        chunks.push(part.value);
      }
      return {
        status: response.status,
        data: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
      };
    } finally {
      reader.releaseLock();
    }
  } catch {
    return { status: 0, data: null };
  } finally {
    url.search = '';
  }
}
