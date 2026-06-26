import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, WalletAccountType } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { isMockSteamId } from '../common/steam-id.util';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
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

  async linkSteamId(userId: string, steamId: string, username?: string) {
    const existing = await this.prisma.user.findUnique({ where: { steamId } });
    if (existing && existing.id !== userId) {
      throw new AppException(
        ErrorCode.STEAM_ALREADY_LINKED,
        'Steam account is already linked to another user',
        HttpStatus.CONFLICT,
      );
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        steamId,
        ...(username ? { username } : {}),
      },
    });

    await this.ledgerService.ensureUserWallet(user.id);
    return user;
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

    return toJsonSafe(user);
  }

  async updateTradeUrl(userId: string, tradeUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { tradeUrl },
    });

    return toJsonSafe(user);
  }
}
