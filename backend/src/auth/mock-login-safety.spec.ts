import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

describe('mock login on money environments', () => {
  const original = process.env;
  afterEach(() => {
    process.env = original;
  });

  it.each([
    ['crypto_tron', 'steam'],
    ['north', 'steam'],
    ['crypto_tron', 'mock'],
    ['north', 'mock'],
  ])(
    'rejects mock login before identity mutation with %s',
    async (payment, auth) => {
      process.env = {
        ...original,
        NODE_ENV: 'development',
        AUTH_PROVIDER: auth,
        PAYMENT_PROVIDER: payment,
        ALLOW_MOCK_LOGIN_IN_STEAM_MODE: 'true',
      };
      const login = jest.fn();
      const signAsync = jest.fn();
      const service = new AuthService(
        { signAsync } as never,
        {} as never,
        {} as never,
        {} as never,
        { login } as never,
        { type: 'steam' } as never,
      );
      await expect(service.mockLogin({ role: UserRole.BUYER })).rejects.toThrow(
        /Mock login/,
      );
      expect(login).not.toHaveBeenCalled();
      expect(signAsync).not.toHaveBeenCalled();
      expect(
        new AuthController(service, {} as never).getConfig().mockLoginAvailable,
      ).toBe(false);
    },
  );
});
