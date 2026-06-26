-- CreateEnum
CREATE TYPE "InventorySyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- AlterEnum
ALTER TYPE "InventoryAssetStatus" ADD VALUE 'REMOVED';

-- CreateTable
CREATE TABLE "InventorySyncRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "status" "InventorySyncStatus" NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "errorCode" TEXT,

    CONSTRAINT "InventorySyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventorySyncRun_userId_fetchedAt_idx" ON "InventorySyncRun"("userId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "InventorySyncRun" ADD CONSTRAINT "InventorySyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
