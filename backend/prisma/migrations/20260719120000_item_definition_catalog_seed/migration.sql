-- Catalog seed fields for full CS2 skin cards (one card per base skin).
ALTER TABLE "ItemDefinition" ADD COLUMN IF NOT EXISTS "baseMarketHashName" TEXT;
ALTER TABLE "ItemDefinition" ADD COLUMN IF NOT EXISTS "availableWears" JSONB;
ALTER TABLE "ItemDefinition" ADD COLUMN IF NOT EXISTS "catalogSeeded" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ItemDefinition_catalogSeeded_marketHashName_idx"
  ON "ItemDefinition"("catalogSeeded", "marketHashName");

CREATE INDEX IF NOT EXISTS "ItemDefinition_baseMarketHashName_idx"
  ON "ItemDefinition"("baseMarketHashName");
