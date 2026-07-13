-- CreateEnum
CREATE TYPE "BuyRequestStatus" AS ENUM ('OPEN', 'CANCELED', 'FULFILLED');

-- CreateTable
CREATE TABLE "BuyRequest" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "itemDefinitionId" TEXT NOT NULL,
    "maxPriceMinor" BIGINT,
    "status" "BuyRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyRequest_buyerId_status_idx" ON "BuyRequest"("buyerId", "status");

-- CreateIndex
CREATE INDEX "BuyRequest_itemDefinitionId_status_idx" ON "BuyRequest"("itemDefinitionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BuyRequest_buyerId_itemDefinitionId_status_key" ON "BuyRequest"("buyerId", "itemDefinitionId", "status");

-- AddForeignKey
ALTER TABLE "BuyRequest" ADD CONSTRAINT "BuyRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyRequest" ADD CONSTRAINT "BuyRequest_itemDefinitionId_fkey" FOREIGN KEY ("itemDefinitionId") REFERENCES "ItemDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
