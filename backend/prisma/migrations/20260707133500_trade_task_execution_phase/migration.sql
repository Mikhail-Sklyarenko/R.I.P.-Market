CREATE TYPE "TradeTaskExecutionPhase" AS ENUM (
  'ACKED',
  'OFFER_DRAFTED',
  'CONFIRM_PENDING',
  'OFFER_SENT',
  'OFFER_FAILED'
);

ALTER TABLE "TradeTask" ADD COLUMN "executionPhase" "TradeTaskExecutionPhase";

CREATE INDEX "TradeTask_executionPhase_status_idx" ON "TradeTask"("executionPhase", "status");

CREATE TABLE "TradeTaskStatusEvent" (
    "id" TEXT NOT NULL,
    "tradeTaskId" TEXT NOT NULL,
    "phase" "TradeTaskExecutionPhase" NOT NULL,
    "reasonCode" TEXT,
    "payload" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeTaskStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TradeTaskStatusEvent_tradeTaskId_idempotencyKey_key"
ON "TradeTaskStatusEvent"("tradeTaskId", "idempotencyKey");
CREATE INDEX "TradeTaskStatusEvent_tradeTaskId_createdAt_idx"
ON "TradeTaskStatusEvent"("tradeTaskId", "createdAt");

ALTER TABLE "TradeTaskStatusEvent"
ADD CONSTRAINT "TradeTaskStatusEvent_tradeTaskId_fkey"
FOREIGN KEY ("tradeTaskId") REFERENCES "TradeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
