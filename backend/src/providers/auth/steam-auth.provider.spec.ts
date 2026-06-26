import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { UsersService } from '../../users/users.service';
import { SteamAuthProvider } from './steam-auth.provider';
import { SteamProfileService } from './steam-profile.service';
import * as steamOpenId from './steam-openid.util';

describe('SteamAuthProvider', () => {
  let provider: SteamAuthProvider;
  let usersService: jest.Mocked<Pick<UsersService, 'upsertBySteamId'>>;
  let steamProfileService: jest.Mocked<Pick<SteamProfileService, 'fetchPersonaName'>>;

  const openidParams = {
    'openid.mode': 'id_res',
    'openid.claimed_id':
      'https://steamcommunity.com/openid/id/76561198000000000',
    'openid.identity':
      'https://steamcommunity.com/openid/id/76561198000000000',
  };

  beforeEach(() => {
    usersService = {
      upsertBySteamId: jest.fn(),
    };
    steamProfileService = {
      fetchPersonaName: jest.fn(),
    };
    provider = new SteamAuthProvider(
      usersService as unknown as UsersService,
      steamProfileService as unknown as SteamProfileService,
    );
    jest.spyOn(steamOpenId, 'verifySteamOpenId').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('upserts user by steamId and returns auth result', async () => {
    usersService.upsertBySteamId.mockResolvedValue({
      id: 'user-1',
      steamId: '76561198000000000',
      username: 'PlayerOne',
      role: UserRole.BUYER,
      status: UserStatus.ACTIVE,
    } as never);
    steamProfileService.fetchPersonaName.mockResolvedValue('PlayerOne');

    const result = await provider.login({ kind: 'steam', openidParams });

    expect(usersService.upsertBySteamId).toHaveBeenCalledWith(
      '76561198000000000',
      'PlayerOne',
    );
    expect(result).toEqual({
      userId: 'user-1',
      username: 'PlayerOne',
      role: UserRole.BUYER,
      status: UserStatus.ACTIVE,
      steamId: '76561198000000000',
    });
  });

  it('is idempotent for the same steamId', async () => {
    usersService.upsertBySteamId.mockResolvedValue({
      id: 'user-1',
      steamId: '76561198000000000',
      username: 'steam_76561198000000000',
      role: UserRole.BUYER,
      status: UserStatus.ACTIVE,
    } as never);
    steamProfileService.fetchPersonaName.mockResolvedValue(null);

    await provider.login({ kind: 'steam', openidParams });
    await provider.login({ kind: 'steam', openidParams });

    expect(usersService.upsertBySteamId).toHaveBeenCalledTimes(2);
    expect(usersService.upsertBySteamId).toHaveBeenNthCalledWith(
      1,
      '76561198000000000',
      undefined,
    );
  });

  it('throws STEAM_AUTH_FAILED when OpenID verification fails', async () => {
    jest.spyOn(steamOpenId, 'verifySteamOpenId').mockResolvedValue(false);

    await expect(
      provider.login({ kind: 'steam', openidParams }),
    ).rejects.toMatchObject({
      code: ErrorCode.STEAM_AUTH_FAILED,
      status: HttpStatus.UNAUTHORIZED,
    });
  });
});
