import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { SensitiveRateLimitService } from './sensitive-rate-limit.service';

describe('SensitiveRateLimitService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ENABLE_SENSITIVE_RATE_LIMITS: 'true',
      RL_MOCK_LOGIN_PER_MIN: '1',
      RL_WITHDRAW_PER_MIN: '1',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws RATE_LIMITED when mock-login budget exceeded', () => {
    const service = new SensitiveRateLimitService();
    service.assertMockLogin('127.0.0.1');
    try {
      service.assertMockLogin('127.0.0.1');
      throw new Error('expected rate limit');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.RATE_LIMITED);
      expect((error as AppException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('isolates buckets by key', () => {
    const service = new SensitiveRateLimitService();
    service.assertWithdrawal('user-a');
    expect(() => service.assertWithdrawal('user-b')).not.toThrow();
    expect(() => service.assertWithdrawal('user-a')).toThrow(AppException);
  });

  it.each(['production', 'test'])(
    'keeps limits outside an isolated test database (%s)',
    (mode) => {
      process.env.NODE_ENV = mode;
      process.env.ENABLE_TEST_ROUTES = 'true';
      process.env.HOST = '127.0.0.1';
      process.env.DATABASE_URL = 'postgresql://local/market';
      const service = new SensitiveRateLimitService();
      service.assertMockLogin('127.0.0.1');
      service.resetIsolatedTestState();
      expect(() => service.assertMockLogin('127.0.0.1')).toThrow(AppException);
    },
  );

  it('resets the isolated test state and continues enforcing limits', () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_TEST_ROUTES = 'true';
    process.env.HOST = '127.0.0.1';
    process.env.DATABASE_URL = 'postgresql://127.0.0.1/p2pcs_e2e';
    const service = new SensitiveRateLimitService();
    service.assertMockLogin('127.0.0.1');
    service.resetIsolatedTestState();
    expect(() => service.assertMockLogin('127.0.0.1')).not.toThrow();
    expect(() => service.assertMockLogin('127.0.0.1')).toThrow(AppException);
  });

  it('no-ops when ENABLE_SENSITIVE_RATE_LIMITS=false', () => {
    process.env.ENABLE_SENSITIVE_RATE_LIMITS = 'false';
    const service = new SensitiveRateLimitService();
    service.assertMockLogin('127.0.0.1');
    expect(() => service.assertMockLogin('127.0.0.1')).not.toThrow();
  });
});
