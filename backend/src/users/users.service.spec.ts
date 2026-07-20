import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { SteamProfileService } from '../providers/auth/steam-profile.service';
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
    inventorySyncRun: {
      deleteMany: jest.Mock;
    };
    inventoryAsset: {
      updateMany: jest.Mock;
    };
  };
  let ledgerService: { ensureUserWallet: jest.Mock };
  let steamProfileService: { fetchPlayerSummary: jest.Mock };

  beforeEach(() => {
    delete process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE;
    prisma = {
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      inventorySyncRun: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      inventoryAsset: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    ledgerService = {
      ensureUserWallet: jest.fn().mockResolvedValue(undefined),
    };
    steamProfileService = {
      fetchPlayerSummary: jest.fn(),
    };
    service = new UsersService(
      prisma as unknown as PrismaService,
      ledgerService as unknown as LedgerService,
      steamProfileService as unknown as SteamProfileService,
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
        steamPersonaName: null,
        steamAvatarUrl: null,
      },
      update: { username: 'PlayerOne' },
    });
    expect(ledgerService.ensureUserWallet).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(user);
  });

  it('upsertBySteamId promotes OWNER_ADMIN_STEAM_IDS to ADMIN', async () => {
    process.env.OWNER_ADMIN_STEAM_IDS = '76561198195181115';
    const user = {
      id: 'owner-1',
      steamId: '76561198195181115',
      username: 'R1ppeR',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    };
    prisma.user.upsert.mockResolvedValue(user);

    const result = await service.upsertBySteamId(
      '76561198195181115',
      'R1ppeR',
    );

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: UserRole.ADMIN }),
        update: expect.objectContaining({ role: UserRole.ADMIN }),
      }),
    );
    expect(result.role).toBe(UserRole.ADMIN);
    delete process.env.OWNER_ADMIN_STEAM_IDS;
  });

  it('syncOwnerAdminRole demotes non-owner Steam ADMIN on session resolve', async () => {
    process.env.OWNER_ADMIN_STEAM_IDS = '76561198195181115';
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-x',
      role: UserRole.ADMIN,
      steamId: '76561198746622771',
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-x',
      role: UserRole.BUYER,
      steamId: '76561198746622771',
    });

    const session = await service.resolveSessionUser('user-x');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-x' },
      data: { role: UserRole.BUYER },
    });
    expect(session).toEqual({ sub: 'user-x', role: UserRole.BUYER });
    delete process.env.OWNER_ADMIN_STEAM_IDS;
  });

  it('linkSteamId updates current user when steamId is free', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'user-2', username: 'mock_seller' });
    prisma.user.update.mockResolvedValue({
      id: 'user-2',
      steamId: '76561198111111111',
      username: 'mock_seller',
      role: UserRole.SELLER,
      status: UserStatus.ACTIVE,
    });

    await service.linkSteamId('user-2', '76561198111111111', {
      personaName: 'linked_user',
      avatarUrl: 'https://example.com/avatar.jpg',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: {
        steamId: '76561198111111111',
        steamPersonaName: 'linked_user',
        steamAvatarUrl: 'https://example.com/avatar.jpg',
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
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'other-user',
        steamId: '76561198111111111',
      })
      .mockResolvedValueOnce({ id: 'user-2', username: 'mock_seller' });
    prisma.user.update
      .mockResolvedValueOnce({ id: 'other-user', steamId: null })
      .mockResolvedValueOnce({
        id: 'user-2',
        steamId: '76561198111111111',
        username: 'mock_seller',
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
      });

    await service.linkSteamId('user-2', '76561198111111111', {
      personaName: 'PlayerOne',
    });

    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'other-user' },
      data: { steamId: null, steamPersonaName: null, steamAvatarUrl: null },
    });
    expect(prisma.user.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'user-2' },
      data: {
        steamId: '76561198111111111',
        steamPersonaName: 'PlayerOne',
        steamAvatarUrl: null,
      },
    });

    delete process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE;
  });
});
