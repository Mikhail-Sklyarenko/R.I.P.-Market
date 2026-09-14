import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../users/users.service';

describe('API token separation', () => {
  const resolveSessionUser = jest.fn(async () => ({ sub: 'user-1' }));
  const strategy = new JwtStrategy({
    resolveSessionUser,
  } as unknown as UsersService);
  beforeEach(() => resolveSessionUser.mockClear());
  it.each([{ purpose: 'steam_link' }, { typ: 'extension' }])(
    'rejects non-access token %j before resolving user',
    async (claims) => {
      await expect(
        strategy.validate({ sub: 'user-1', ...claims } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(resolveSessionUser).not.toHaveBeenCalled();
    },
  );
  it('accepts access tokens', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', purpose: 'access' } as never),
    ).resolves.toEqual({ sub: 'user-1' });
  });
});
