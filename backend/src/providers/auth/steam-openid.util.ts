export const STEAM_OPENID_ENDPOINT =
  'https://steamcommunity.com/openid/login';

const STEAM_CLAIMED_ID_PATTERN =
  /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

export function parseSteamId64FromClaimedId(claimedId: string): string | null {
  const match = claimedId.match(STEAM_CLAIMED_ID_PATTERN);
  return match?.[1] ?? null;
}

export type OpenIdPostFn = (url: string, body: string) => Promise<string>;

async function defaultOpenIdPost(url: string, body: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return response.text();
}

export async function verifySteamOpenId(
  openidParams: Record<string, string>,
  postFn: OpenIdPostFn = defaultOpenIdPost,
): Promise<boolean> {
  if (openidParams['openid.mode'] !== 'id_res') {
    return false;
  }

  const params = new URLSearchParams(openidParams);
  params.set('openid.mode', 'check_authentication');

  const response = await postFn(STEAM_OPENID_ENDPOINT, params.toString());
  return response.includes('is_valid:true');
}

export function extractOpenIdParams(
  query: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('openid.') && typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}
