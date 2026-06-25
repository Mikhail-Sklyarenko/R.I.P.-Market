import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, WalletAccountType } from '@prisma/client';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';

type MockIdentity = {
  role: UserRole;
  username: string;
  steamId: string;
};

const MOCK_IDENTITIES: MockIdentity[] = [
  {
    role: UserRole.SELLER,
    username: 'mock_seller',
    steamId: 'steam_mock_seller',
  },
  { role: UserRole.BUYER, username: 'mock_buyer', steamId: 'steam_mock_buyer' },
  { role: UserRole.ADMIN, username: 'mock_admin', steamId: 'steam_mock_admin' },
];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureMockUsers(): Promise<void> {
    for (const identity of MOCK_IDENTITIES) {
      const user = await this.prisma.user.upsert({
        where: { steamId: identity.steamId },
        create: {
          steamId: identity.steamId,
          username: identity.username,
          role: identity.role,
          status: UserStatus.ACTIVE,
        },
        update: {
          role: identity.role,
          username: identity.username,
          status: UserStatus.ACTIVE,
        },
      });

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

    const user = await this.prisma.user.findFirst({
      where: { role },
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
