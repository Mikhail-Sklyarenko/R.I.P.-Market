-- AlterTable
ALTER TABLE "TradeOperation" ADD COLUMN "externalOfferId" TEXT,
ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN "checkCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "expectedAssetId" TEXT,
ADD COLUMN "verificationMode" TEXT;

-- CreateIndex
CREATE INDEX "TradeOperation_status_verificationMode_idx" ON "TradeOperation"("status", "verificationMode");

-- CreateTable
CREATE TABLE "TradePollEvent" (
    "id" TEXT NOT NULL,
    "tradeOperationId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerStatus" TEXT,
    "outcome" TEXT NOT NULL,
    "strategy" TEXT,
    "error" TEXT,

    CONSTRAINT "TradePollEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradePollEvent_tradeOperationId_checkedAt_idx" ON "TradePollEvent"("tradeOperationId", "checkedAt");

-- AddForeignKey
ALTER TABLE "TradePollEvent" ADD CONSTRAINT "TradePollEvent_tradeOperationId_fkey" FOREIGN KEY ("tradeOperationId") REFERENCES "TradeOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
