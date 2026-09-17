import {
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import { TestRouteGuardService } from './test-route-guard.service';

@ApiTags('test')
@Controller('test')
export class TestResetController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly jwtService: JwtService,
    private readonly testRouteGuard: TestRouteGuardService,
  ) {}

  @Post('reset')
  async reset(@Req() req: Request) {
    this.testRouteGuard.assertDestructiveAllowed(req);

    await this.prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "Notification",
        "OutboxEvent",
        "AuditLog",
        "ExtensionCommandAck",
        "ExtensionNonce",
        "ExtensionSession",
        "SupportTicket",
        "BuyRequest",
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
  async extraSellerSession(@Req() req: Request) {
    this.testRouteGuard.assertDestructiveAllowed(req);

    const suffix = Date.now().toString(36);
    const user = await this.prisma.user.create({
      data: {
        username: `seller_e2e_${suffix}`,
        steamId: `7656119800000000${(suffix.charCodeAt(0) % 8) + 1}`,
        tradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh',
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
  async linkSteam(
    @Req() req: Request,
    @Body() body: { userId: string; steamId?: string },
  ) {
    this.testRouteGuard.assertDestructiveAllowed(req);

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
