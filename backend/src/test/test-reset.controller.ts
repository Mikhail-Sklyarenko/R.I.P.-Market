import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { DevTradeResetService } from './dev-trade-reset.service';

function isDevResetEnabled(): boolean {
  return (
    process.env.ENABLE_TEST_ROUTES === 'true' ||
    process.env.ENABLE_MOCK_TRADE === 'true'
  );
}

@ApiTags('test')
@Controller('test')
export class TestResetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly jwtService: JwtService,
    private readonly devTradeResetService: DevTradeResetService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('reset-dev-trades')
  async resetDevTrades(@CurrentUser() user: AuthUser) {
    if (!isDevResetEnabled()) {
      return { ok: false, reason: 'disabled' };
    }
    if (user.role !== UserRole.SELLER && user.role !== UserRole.ADMIN) {
      return { ok: false, reason: 'seller_or_admin_required' };
    }
    return this.devTradeResetService.resetForSeller(user.sub);
  }

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
        "ExtensionCommandAck",
        "ExtensionNonce",
        "ExtensionSession",
        "ExtensionDevice",
        "TradeTaskStatusEvent",
        "TradeTask",
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
