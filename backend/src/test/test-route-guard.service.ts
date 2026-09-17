import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { getRequestClientIp } from '../common/request-client-ip.util';

const LIVE_PAYMENT_PROVIDERS = new Set(['crypto_tron', 'north']);

function isLoopbackIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1' ||
    normalized.startsWith('127.')
  );
}

/**
 * Destructive e2e helpers (DB wipe, mint JWT) must never be reachable on a
 * money-facing host even if ENABLE_TEST_ROUTES was left on by mistake.
 */
@Injectable()
export class TestRouteGuardService {
  assertDestructiveAllowed(req: Request): void {
    if (process.env.ENABLE_TEST_ROUTES !== 'true') {
      throw new ForbiddenException('Test routes are disabled');
    }

    const payment = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
    if (LIVE_PAYMENT_PROVIDERS.has(payment)) {
      throw new ForbiddenException(
        'Test wipe/session routes are forbidden with live payment providers',
      );
    }

    const secret = process.env.E2E_TEST_RESET_SECRET?.trim();
    if (secret) {
      const header = req.headers['x-e2e-reset-token'];
      const token = Array.isArray(header) ? header[0] : header;
      if (token !== secret) {
        throw new ForbiddenException('Invalid or missing X-E2E-Reset-Token');
      }
      return;
    }

    // No shared secret configured: only accept loopback clients (local e2e/CI).
    const ip = getRequestClientIp(req);
    if (!isLoopbackIp(ip)) {
      throw new ForbiddenException(
        'Test wipe/session routes require loopback or E2E_TEST_RESET_SECRET',
      );
    }
  }
}
