import type { Request } from 'express';

/** Best-effort client IP (first X-Forwarded-For hop, else Express `ip`). */
export function getRequestClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0]?.trim() || 'unknown';
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
