import { PrismaService } from '../../src/prisma/prisma.service';

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
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
}
