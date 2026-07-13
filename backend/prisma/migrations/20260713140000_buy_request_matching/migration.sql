-- AlterEnum
ALTER TYPE "BuyRequestStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "BuyRequest" ADD COLUMN "lastNotifiedLotId" TEXT,
ADD COLUMN "lastNotifiedPriceMinor" BIGINT;
