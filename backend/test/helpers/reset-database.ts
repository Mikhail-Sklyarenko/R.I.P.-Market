import { PrismaService } from '../../src/prisma/prisma.service';

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Notification",
      "OutboxEvent",
      "PaymentEvent",
      "PaymentIntent",
      "WithdrawalRequest",
      "UserCryptoDeposit",
      "AuditLog",
      "LedgerEntry",
      "Hold",
      "TradePollEvent",
      "TradeVerificationSnapshot",
      "SettlementAllowlistEntry",
      "ExtensionRolloutAllowlistEntry",
      "SettlementDailyStats",
      "ExtensionCommandAck",
      "ExtensionNonce",
      "ExtensionSession",
      "ExtensionDevice",
      "TradeTaskStatusEvent",
      "TradeTask",
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
