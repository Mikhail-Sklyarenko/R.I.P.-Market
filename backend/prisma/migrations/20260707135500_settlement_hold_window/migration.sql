ALTER TABLE "Hold"
ADD COLUMN "settlementHoldUntil" TIMESTAMP(3),
ADD COLUMN "settlementReleasedAt" TIMESTAMP(3);

CREATE INDEX "Hold_settlement_release_idx"
ON "Hold"("settlementHoldUntil", "settlementReleasedAt");
