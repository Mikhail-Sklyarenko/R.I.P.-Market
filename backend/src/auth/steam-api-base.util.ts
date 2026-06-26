/** Public API base URL used for Steam OpenID return_to (includes /api/v1). */
export function getApiPublicBaseUrl(): string {
  const configured = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
  if (configured) {
    return configured;
  }

  const realm = process.env.STEAM_OPENID_REALM?.replace(/\/$/, '');
  if (realm) {
    return `${realm}/api/v1`;
  }

  const port = process.env.PORT ?? '3000';
  return `http://localhost:${port}/api/v1`;
}
