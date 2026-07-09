-- Add extension-first statuses while keeping backward compatibility.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SETTLEMENT_HOLD';
ALTER TYPE "TradeOperationStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_VERIFIED';

CREATE TABLE "TradeOperationStatusEvent" (
    "id" TEXT NOT NULL,
    "tradeOperationId" TEXT NOT NULL,
    "fromStatus" "TradeOperationStatus",
    "toStatus" "TradeOperationStatus" NOT NULL,
    "event" TEXT,
    "actorUserId" TEXT,
    "reason" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeOperationStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TradeOperationStatusEvent_tradeOperationId_createdAt_idx"
ON "TradeOperationStatusEvent"("tradeOperationId", "createdAt");

ALTER TABLE "TradeOperationStatusEvent"
ADD CONSTRAINT "TradeOperationStatusEvent_tradeOperationId_fkey"
FOREIGN KEY ("tradeOperationId") REFERENCES "TradeOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
