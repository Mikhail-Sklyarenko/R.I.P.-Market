ALTER TABLE "InventoryAsset"
ADD COLUMN "inspectLinkTemplate" TEXT,
ADD COLUMN "classExternalId" TEXT,
ADD COLUMN "instanceExternalId" TEXT;

ALTER TABLE "LotListingSnapshot"
ADD COLUMN "inspectLink" TEXT;
