import { Controller, Post, Body } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';

@ApiTags('test')
@Controller('test')
export class TestResetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('reset')
  async reset() {
    if (process.env.ENABLE_TEST_ROUTES !== 'true') {
      return { ok: false, reason: 'disabled' };
    }

    await this.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "Notification",
        "OutboxEvent",
        "AuditLog",
        "LedgerEntry",
        "Hold",
        "TradePollEvent",
        "TradeOperation",
        "OrderStatusEvent",
        "Order",
        "LotStatusEvent",
        "Lot",
        "InventorySyncRun",
        "InventoryAsset",
        "ItemDefinition",
        "WalletAccount",
        "Wallet",
        "PaymentEvent",
        "PaymentIntent",
        "WithdrawalRequest",
        "UserCryptoDeposit",
        "User"
      RESTART IDENTITY CASCADE;
    `);

    return { ok: true };
  }

  @Post('extra-seller-session')
  async extraSellerSession() {
    if (process.env.ENABLE_TEST_ROUTES !== 'true') {
      return { ok: false, reason: 'disabled' };
    }

    const suffix = Date.now().toString(36);
    const user = await this.prisma.user.create({
      data: {
        username: `seller_e2e_${suffix}`,
        steamId: `steam_seller_e2e_${suffix}`,
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
      },
    });
    await this.ledgerService.ensureUserWallet(user.id);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    return { ok: true, accessToken, userId: user.id };
  }

  @Post('link-steam')
  async linkSteam(@Body() body: { userId: string; steamId?: string }) {
    if (process.env.ENABLE_TEST_ROUTES !== 'true') {
      return { ok: false, reason: 'disabled' };
    }

    if (!body.userId) {
      return { ok: false, reason: 'userId required' };
    }

    await this.prisma.user.update({
      where: { id: body.userId },
      data: {
        steamId: body.steamId ?? `76561198${Date.now().toString().slice(-10)}`,
      },
    });

    return { ok: true };
  }
}
