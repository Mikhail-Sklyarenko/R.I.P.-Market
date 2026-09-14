ALTER TABLE "TradeTask" ADD COLUMN "leaseDeviceId" TEXT,
 ADD COLUMN "leaseUntil" TIMESTAMP(3), ADD COLUMN "leaseVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "sendStartedAt" TIMESTAMP(3);
-- Existing external actions must not be re-enqueued by a deploy.
UPDATE "TradeTask" t SET "sendStartedAt" = t."updatedAt"
WHERE t."executionPhase" IN ('ITEM_SELECTED', 'OFFER_SUBMITTED', 'CONFIRM_PENDING', 'OFFER_SENT')
OR EXISTS (SELECT 1 FROM "TradeTaskStatusEvent" e WHERE e."tradeTaskId" = t.id
 AND e.phase IN ('ITEM_SELECTED', 'OFFER_SUBMITTED', 'CONFIRM_PENDING', 'OFFER_SENT'));
CREATE INDEX "TradeTask_leaseUntil_idx" ON "TradeTask" ("leaseUntil");
