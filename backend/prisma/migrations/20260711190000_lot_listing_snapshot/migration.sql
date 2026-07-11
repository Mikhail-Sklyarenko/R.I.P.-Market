-- AlterTable
ALTER TABLE "InventoryAsset" ADD COLUMN "marketable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "LotListingSnapshot" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "assetExternalId" TEXT NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "weapon" TEXT,
    "rarity" TEXT,
    "iconUrl" TEXT,
    "floatValue" DECIMAL(8,6),
    "paintSeed" INTEGER,
    "wear" TEXT,
    "tradable" BOOLEAN NOT NULL,
    "marketable" BOOLEAN NOT NULL DEFAULT true,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotListingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LotListingSnapshot_lotId_key" ON "LotListingSnapshot"("lotId");

-- AddForeignKey
ALTER TABLE "LotListingSnapshot" ADD CONSTRAINT "LotListingSnapshot_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
