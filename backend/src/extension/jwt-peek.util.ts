/**
 * I3: Peek JWT `typ` without verification so we never fall through
 * a revoked extension token into JwtAuthGuard when secrets coincide.
 */
export function peekJwtTyp(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2 || !parts[1]) {
      return null;
    }
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { typ?: unknown };
    return typeof payload.typ === 'string' ? payload.typ : null;
  } catch {
    return null;
  }
}

export function extractBearerToken(
  authorization: string | undefined,
): string | null {
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}
