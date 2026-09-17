import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { TestRouteGuardService } from './test-route-guard.service';

function req(ip: string, headers: Record<string, string> = {}): Request {
  return { ip, headers, socket: { remoteAddress: ip } } as unknown as Request;
}

describe('TestRouteGuardService', () => {
  const original = process.env;
  const guard = new TestRouteGuardService();

  beforeEach(() => {
    process.env = { ...original, ENABLE_TEST_ROUTES: 'true', PAYMENT_PROVIDER: 'mock' };
  });

  afterEach(() => {
    process.env = original;
  });

  it('allows loopback without secret', () => {
    expect(() => guard.assertDestructiveAllowed(req('127.0.0.1'))).not.toThrow();
  });

  it('blocks non-loopback without secret', () => {
    expect(() => guard.assertDestructiveAllowed(req('8.8.8.8'))).toThrow(
      ForbiddenException,
    );
  });

  it('blocks live payment providers', () => {
    process.env.PAYMENT_PROVIDER = 'crypto_tron';
    expect(() => guard.assertDestructiveAllowed(req('127.0.0.1'))).toThrow(
      /live payment/,
    );
  });

  it('accepts matching E2E_TEST_RESET_SECRET from any IP', () => {
    process.env.E2E_TEST_RESET_SECRET = 's3cret';
    expect(() =>
      guard.assertDestructiveAllowed(
        req('8.8.8.8', { 'x-e2e-reset-token': 's3cret' }),
      ),
    ).not.toThrow();
  });
});
