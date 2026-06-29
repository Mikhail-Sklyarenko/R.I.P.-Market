import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { LedgerService } from '../wallet/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService (Steam identity)', () => {
  let service: UsersService;
  let prisma: {
    user: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let ledgerService: { ensureUserWallet: jest.Mock };

  beforeEach(() => {
    delete process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE;
    prisma = {
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    ledgerService = {
      ensureUserWallet: jest.fn().mockResolvedValue(undefined),
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      ledgerService as unknown as LedgerService,
    );
  });

  it('upsertBySteamId creates buyer wallet for new steam users', async () => {
    const user = {
      id: 'user-1',
      steamId: '76561198000000000',
      username: 'PlayerOne',
      role: UserRole.BUYER,
      status: UserStatus.ACTIVE,
    };
    prisma.user.upsert.mockResolvedValue(user);

    const result = await service.upsertBySteamId(
      '76561198000000000',
      'PlayerOne',
    );

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { steamId: '76561198000000000' },
      create: {
        steamId: '76561198000000000',
        username: 'PlayerOne',
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
      },
      update: { username: 'PlayerOne' },
    });
    expect(ledgerService.ensureUserWallet).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(user);
  });

  it('linkSteamId updates current user when steamId is free', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({
      id: 'user-2',
      steamId: '76561198111111111',
      username: 'linked_user',
      role: UserRole.SELLER,
      status: UserStatus.ACTIVE,
    });

    await service.linkSteamId('user-2', '76561198111111111', 'linked_user');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: {
        steamId: '76561198111111111',
        username: 'linked_user',
      },
    });
    expect(ledgerService.ensureUserWallet).toHaveBeenCalledWith('user-2');
  });

  it('linkSteamId throws STEAM_ALREADY_LINKED when steamId belongs to another user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'other-user',
      steamId: '76561198111111111',
    });

    try {
      await service.linkSteamId('user-2', '76561198111111111');
      throw new Error('Expected linkSteamId to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.STEAM_ALREADY_LINKED);
      expect((error as AppException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('linkSteamId reassigns steamId in dev mock-login mode', async () => {
    process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE = 'true';
    prisma.user.findUnique.mockResolvedValue({
      id: 'other-user',
      steamId: '76561198111111111',
    });
    prisma.user.update
      .mockResolvedValueOnce({ id: 'other-user', steamId: null })
      .mockResolvedValueOnce({
        id: 'user-2',
        steamId: '76561198111111111',
        username: 'mock_seller',
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
      });

    await service.linkSteamId('user-2', '76561198111111111', 'PlayerOne');

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'other-user' },
      data: { steamId: null },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-2' },
      data: {
        steamId: '76561198111111111',
        username: 'PlayerOne',
      },
    });

    delete process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE;
  });
});
