import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, WalletAccountType, InventoryAssetStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { isMockSteamId } from '../common/steam-id.util';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { SteamProfileService } from '../providers/auth/steam-profile.service';
import { LedgerService } from '../wallet/ledger.service';

type MockIdentity = {
  role: UserRole;
  username: string;
};

const MOCK_IDENTITIES: MockIdentity[] = [
  { role: UserRole.SELLER, username: 'mock_seller' },
  { role: UserRole.BUYER, username: 'mock_buyer' },
  { role: UserRole.ADMIN, username: 'mock_admin' },
];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly steamProfileService: SteamProfileService,
  ) {}

  async ensureMockUsers(): Promise<void> {
    for (const identity of MOCK_IDENTITIES) {
      let user = await this.prisma.user.findFirst({
        where: {
          username: identity.username,
          role: identity.role,
        },
      });

      if (user) {
        const updates: {
          username: string;
          role: UserRole;
          status: UserStatus;
          steamId?: null;
        } = {
          username: identity.username,
          role: identity.role,
          status: UserStatus.ACTIVE,
        };
        if (user.steamId && isMockSteamId(user.steamId)) {
          updates.steamId = null;
        }
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            username: identity.username,
            role: identity.role,
            status: UserStatus.ACTIVE,
            steamId: null,
          },
        });
      }

      const wallet = await this.prisma.wallet.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          currency: 'USD',
        },
        update: {},
      });

      for (const type of [
        WalletAccountType.AVAILABLE,
        WalletAccountType.HOLD,
        WalletAccountType.FROZEN,
      ]) {
        await this.prisma.walletAccount.upsert({
          where: {
            walletId_type: {
              walletId: wallet.id,
              type,
            },
          },
          create: {
            walletId: wallet.id,
            type,
            balanceMinor: BigInt(0),
          },
          update: {},
        });
      }
    }
  }

  async getMockUserByRole(role: UserRole) {
    await this.ensureMockUsers();

    const identity = MOCK_IDENTITIES.find((item) => item.role === role);
    if (!identity) {
      throw new NotFoundException(`Mock user for role ${role} not found`);
    }

    const user = await this.prisma.user.findFirst({
      where: {
        username: identity.username,
        role: identity.role,
      },
      include: {
        wallet: {
          include: {
            accounts: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Mock user for role ${role} not found`);
    }

    return toJsonSafe(user);
  }

  async upsertBySteamId(steamId: string, username?: string) {
    const user = await this.prisma.user.upsert({
      where: { steamId },
      create: {
        steamId,
        username: username ?? `steam_${steamId}`,
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
      },
      update: username ? { username } : {},
    });

    await this.ledgerService.ensureUserWallet(user.id);
    return user;
  }

  async linkSteamId(userId: string, steamId: string, personaName?: string) {
    const existing = await this.prisma.user.findUnique({ where: { steamId } });
    if (existing && existing.id !== userId) {
      if (this.isDevSteamLinkReassignEnabled()) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { steamId: null, steamPersonaName: null },
        });
      } else {
        throw new AppException(
          ErrorCode.STEAM_ALREADY_LINKED,
          'Steam account is already linked to another user',
          HttpStatus.CONFLICT,
        );
      }
    }

    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
      throw new NotFoundException('User not found');
    }

    const preserveMockUsername = MOCK_IDENTITIES.some(
      (identity) => identity.username === current.username,
    );

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        steamId,
        steamPersonaName: personaName ?? null,
        ...(personaName && !preserveMockUsername
          ? { username: personaName }
          : {}),
      },
    });

    await this.clearInventoryForSteamChange(userId);
    await this.ledgerService.ensureUserWallet(user.id);
    return user;
  }

  async unlinkSteamId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.steamId) {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Steam account is not linked',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        steamId: null,
        steamPersonaName: null,
      },
    });

    await this.clearInventoryForSteamChange(userId);
    await this.revokeExtensionSessions(userId);
    return updated;
  }

  private async revokeExtensionSessions(userId: string): Promise<void> {
    await this.prisma.extensionSession.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  }

  private async clearInventoryForSteamChange(userId: string): Promise<void> {
    await this.prisma.inventorySyncRun.deleteMany({ where: { userId } });
    await this.prisma.inventoryAsset.updateMany({
      where: {
        ownerId: userId,
        status: InventoryAssetStatus.AVAILABLE,
      },
      data: { status: InventoryAssetStatus.REMOVED },
    });
  }

  async getById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: {
          include: {
            accounts: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const enriched = await this.enrichSteamPersonaName(user);
    return toJsonSafe(enriched);
  }

  private async enrichSteamPersonaName<
    T extends {
      id: string;
      steamId: string | null;
      steamPersonaName: string | null;
    },
  >(user: T): Promise<T> {
    if (!user.steamId || user.steamPersonaName) {
      return user;
    }

    const personaName = await this.steamProfileService.fetchPersonaName(
      user.steamId,
    );
    if (!personaName) {
      return user;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { steamPersonaName: personaName },
      include: {
        wallet: {
          include: {
            accounts: true,
          },
        },
      },
    });

    return updated as unknown as T;
  }

  private isDevSteamLinkReassignEnabled(): boolean {
    return process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE === 'true';
  }

  async updateTradeUrl(userId: string, tradeUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { tradeUrl },
    });

    return toJsonSafe(user);
  }
}
