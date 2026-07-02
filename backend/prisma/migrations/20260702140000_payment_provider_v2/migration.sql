-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');
CREATE TYPE "WithdrawalRequestStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED');

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'WITHDRAW';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'WITHDRAW_FEE';

-- Drop legacy crypto tables from prior iteration
DROP TABLE IF EXISTS "GatewayEvent";
DROP TABLE IF EXISTS "CryptoWithdrawal";
DROP TABLE IF EXISTS "CryptoDeposit";
DROP TABLE IF EXISTS "CryptoDepositAddress";
DROP TYPE IF EXISTS "CryptoWithdrawalStatus";

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'crypto_tron',
    "amountMinor" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentIntentStatus" NOT NULL,
    "providerRef" TEXT,
    "depositAddress" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "userId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "netMinor" BIGINT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "status" "WithdrawalRequestStatus" NOT NULL,
    "gatewayRef" TEXT,
    "payoutTxHash" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserCryptoDeposit" (
    "userId" TEXT NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "walletIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCryptoDeposit_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "PaymentIntent_idempotencyKey_key" ON "PaymentIntent"("idempotencyKey");
CREATE INDEX "PaymentIntent_userId_status_idx" ON "PaymentIntent"("userId", "status");
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");
CREATE UNIQUE INDEX "WithdrawalRequest_idempotencyKey_key" ON "WithdrawalRequest"("idempotencyKey");
CREATE INDEX "WithdrawalRequest_userId_status_idx" ON "WithdrawalRequest"("userId", "status");
CREATE UNIQUE INDEX "UserCryptoDeposit_depositAddress_key" ON "UserCryptoDeposit"("depositAddress");
CREATE UNIQUE INDEX "UserCryptoDeposit_walletIndex_key" ON "UserCryptoDeposit"("walletIndex");
