import { Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('test')
@Controller('test')
export class TestResetController {
  constructor(private readonly prisma: PrismaService) {}

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
        "TradeOperation",
        "OrderStatusEvent",
        "Order",
        "LotStatusEvent",
        "Lot",
        "InventoryAsset",
        "ItemDefinition",
        "WalletAccount",
        "Wallet",
        "User"
      RESTART IDENTITY CASCADE;
    `);

    return { ok: true };
  }
}
