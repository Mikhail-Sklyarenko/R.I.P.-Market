-- Buy requests: quantity, balance reservation, multiple open requests per item.
ALTER TABLE "BuyRequest" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "BuyRequest" ADD COLUMN "quantityFilled" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BuyRequest" ADD COLUMN "reservedAmountMinor" BIGINT;

DROP INDEX IF EXISTS "BuyRequest_buyerId_itemDefinitionId_status_key";

CREATE INDEX "BuyRequest_buyerId_itemDefinitionId_status_idx"
  ON "BuyRequest"("buyerId", "itemDefinitionId", "status");
