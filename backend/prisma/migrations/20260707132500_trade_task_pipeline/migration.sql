CREATE TYPE "TradeTaskStatus" AS ENUM ('CREATED', 'DISPATCHED', 'ACKED', 'FAILED', 'EXPIRED');

CREATE TABLE "TradeTask" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tradeOperationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "TradeTaskStatus" NOT NULL DEFAULT 'CREATED',
    "dedupKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradeTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TradeTask_orderId_dedupKey_key" ON "TradeTask"("orderId", "dedupKey");
CREATE INDEX "TradeTask_status_nextAttemptAt_expiresAt_idx" ON "TradeTask"("status", "nextAttemptAt", "expiresAt");
CREATE INDEX "TradeTask_tradeOperationId_createdAt_idx" ON "TradeTask"("tradeOperationId", "createdAt");

ALTER TABLE "TradeTask"
ADD CONSTRAINT "TradeTask_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeTask"
ADD CONSTRAINT "TradeTask_tradeOperationId_fkey"
FOREIGN KEY ("tradeOperationId") REFERENCES "TradeOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
