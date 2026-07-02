-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('detected', 'held', 'credited', 'rejected');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'processing', 'paid', 'failed');

-- CreateTable
CREATE TABLE "WalletRegistry" (
    "walletIndex" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletRegistry_pkey" PRIMARY KEY ("walletIndex")
);

-- CreateTable
CREATE TABLE "WalletCounter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "next" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WalletCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayUser" (
    "id" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "walletIndex" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "balanceSun" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "amountSun" BIGINT NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'detected',
    "blockNumber" BIGINT,
    "creditedAt" TIMESTAMP(3),
    "webhookEventId" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amountSun" BIGINT NOT NULL,
    "feeSun" BIGINT NOT NULL DEFAULT 0,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "payoutTxHash" TEXT,
    "failReason" TEXT,
    "webhookEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastBlock" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletRegistry_address_key" ON "WalletRegistry"("address");
CREATE UNIQUE INDEX "GatewayUser_externalUserId_key" ON "GatewayUser"("externalUserId");
CREATE UNIQUE INDEX "GatewayUser_walletIndex_key" ON "GatewayUser"("walletIndex");
CREATE UNIQUE INDEX "GatewayUser_address_key" ON "GatewayUser"("address");
CREATE UNIQUE INDEX "Payment_txHash_key" ON "Payment"("txHash");
CREATE UNIQUE INDEX "Payment_webhookEventId_key" ON "Payment"("webhookEventId");
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE UNIQUE INDEX "Withdrawal_payoutTxHash_key" ON "Withdrawal"("payoutTxHash");
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");
CREATE UNIQUE INDEX "WebhookDelivery_eventId_key" ON "WebhookDelivery"("eventId");
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "GatewayUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "GatewayUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
