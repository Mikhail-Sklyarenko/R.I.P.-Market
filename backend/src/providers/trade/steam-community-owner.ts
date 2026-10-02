type OwnerResult = { owner: string | null; status: number };
const ORIGIN = 'https://steamcommunity.com';
/** Only Steam's authenticated /my redirect selects the profile. Never a client URL. */
export async function steamCommunityOwner(
  token: string,
  expectedOwner: string,
): Promise<OwnerResult> {
  if (
    !/^[1-9][0-9]{16}$/.test(expectedOwner) ||
    !/^[A-Za-z0-9._-]{32,8192}$/.test(token)
  )
    return { owner: null, status: 0 };
  let cookie =
    'steamLoginSecure=' + encodeURIComponent(expectedOwner + '||' + token);
  try {
    const response = await fetch(ORIGIN + '/my/?xml=1', {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { Cookie: cookie },
    });
    const status = response.status;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (status !== 302 || !location) return { owner: null, status };
    const profile = new URL(location, ORIGIN);
    if (
      profile.origin !== ORIGIN ||
      profile.username ||
      profile.password ||
      profile.hash
    )
      return { owner: null, status };
    const numeric = /^\/profiles\/([1-9][0-9]{16})\/?$/.exec(profile.pathname);
    // A numeric profile must be selected by authenticated Steam, not the supplied cookie prefix.
    if (numeric) return { owner: numeric[1], status };
    if (!/^\/id\/[A-Za-z0-9_-]{1,64}\/?$/.test(profile.pathname))
      return { owner: null, status };
    profile.search = '?xml=1';
    // Resolve Steam-selected vanity profile WITHOUT forwarding credentials.
    const xml = await fetch(profile, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!xml.ok) {
      await xml.body?.cancel();
      return { owner: null, status: xml.status };
    }
    const reader = xml.body?.getReader();
    if (!reader) return { owner: null, status: xml.status };
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 262144) {
          await reader.cancel();
          return { owner: null, status: xml.status };
        }
        chunks.push(part.value);
      }
      // Steam's first profile field; do not interpret entities, CDATA or user profile HTML.
      const text = Buffer.concat(chunks).toString('utf8');
      const match =
        /^\s*(?:<\?xml[^?]*\?>\s*)?<profile>\s*<steamID64>([1-9][0-9]{16})<\/steamID64>/.exec(
          text,
        );
      return { owner: match?.[1] ?? null, status: xml.status };
    } finally {
      reader.releaseLock();
    }
  } catch {
    return { owner: null, status: 0 };
  } finally {
    cookie = '';
  }
}
