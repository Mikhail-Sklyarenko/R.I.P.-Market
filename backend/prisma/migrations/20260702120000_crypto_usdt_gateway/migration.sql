-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_REFUND';

-- CreateEnum
CREATE TYPE "CryptoWithdrawalStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "CryptoDepositAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoDepositAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoDeposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "creditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoWithdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "status" "CryptoWithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayWithdrawalId" TEXT,
    "payoutTxHash" TEXT,
    "providerEventId" TEXT,
    "failReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoDepositAddress_userId_key" ON "CryptoDepositAddress"("userId");
CREATE UNIQUE INDEX "CryptoDepositAddress_address_key" ON "CryptoDepositAddress"("address");
CREATE UNIQUE INDEX "CryptoDeposit_txHash_key" ON "CryptoDeposit"("txHash");
CREATE UNIQUE INDEX "CryptoDeposit_providerEventId_key" ON "CryptoDeposit"("providerEventId");
CREATE INDEX "CryptoDeposit_userId_createdAt_idx" ON "CryptoDeposit"("userId", "createdAt");
CREATE UNIQUE INDEX "CryptoWithdrawal_gatewayWithdrawalId_key" ON "CryptoWithdrawal"("gatewayWithdrawalId");
CREATE UNIQUE INDEX "CryptoWithdrawal_providerEventId_key" ON "CryptoWithdrawal"("providerEventId");
CREATE UNIQUE INDEX "CryptoWithdrawal_userId_idempotencyKey_key" ON "CryptoWithdrawal"("userId", "idempotencyKey");
CREATE INDEX "CryptoWithdrawal_userId_status_createdAt_idx" ON "CryptoWithdrawal"("userId", "status", "createdAt");
CREATE UNIQUE INDEX "GatewayEvent_eventId_key" ON "GatewayEvent"("eventId");
CREATE INDEX "GatewayEvent_eventType_createdAt_idx" ON "GatewayEvent"("eventType", "createdAt");
