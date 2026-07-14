export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';

const STEAM_CLAIMED_ID_PATTERN =
  /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

export function parseSteamId64FromClaimedId(claimedId: string): string | null {
  const match = claimedId.match(STEAM_CLAIMED_ID_PATTERN);
  return match?.[1] ?? null;
}

export type OpenIdPostResult = {
  status: number;
  body: string;
};

export type OpenIdPostFn = (
  url: string,
  body: string,
) => Promise<OpenIdPostResult | string>;

async function defaultOpenIdPost(
  url: string,
  body: string,
): Promise<OpenIdPostResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; RIP-Market/1.0)',
      Accept: 'text/plain,*/*',
    },
    body,
  });
  return {
    status: response.status,
    body: await response.text(),
  };
}

function normalizeOpenIdPostResult(
  result: OpenIdPostResult | string,
): OpenIdPostResult {
  if (typeof result === 'string') {
    return { status: 200, body: result };
  }
  return result;
}

export type SteamOpenIdVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'blocked' };

export async function verifySteamOpenId(
  openidParams: Record<string, string>,
  postFn: OpenIdPostFn = defaultOpenIdPost,
): Promise<SteamOpenIdVerifyResult> {
  if (openidParams['openid.mode'] !== 'id_res') {
    return { ok: false, reason: 'invalid' };
  }

  const params = new URLSearchParams(openidParams);
  params.set('openid.mode', 'check_authentication');

  const response = normalizeOpenIdPostResult(
    await postFn(STEAM_OPENID_ENDPOINT, params.toString()),
  );

  if (
    response.status === 403 ||
    /access denied/i.test(response.body) ||
    /edgesuite\.net/i.test(response.body)
  ) {
    return { ok: false, reason: 'blocked' };
  }

  if (response.body.includes('is_valid:true')) {
    return { ok: true };
  }

  return { ok: false, reason: 'invalid' };
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
