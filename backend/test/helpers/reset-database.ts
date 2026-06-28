import { PrismaService } from '../../src/prisma/prisma.service';

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Notification",
      "OutboxEvent",
      "AuditLog",
      "LedgerEntry",
      "Hold",
      "TradePollEvent",
      "TradeVerificationSnapshot",
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
      "User"
    RESTART IDENTITY CASCADE;
  `);
}
