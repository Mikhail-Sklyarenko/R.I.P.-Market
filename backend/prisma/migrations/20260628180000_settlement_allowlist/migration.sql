-- CreateTable
CREATE TABLE "SettlementAllowlistEntry" (
    "steamId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxOrderMinor" BIGINT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementAllowlistEntry_pkey" PRIMARY KEY ("steamId")
);

-- CreateTable
CREATE TABLE "SettlementDailyStats" (
    "day" TEXT NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "volumeMinor" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementDailyStats_pkey" PRIMARY KEY ("day")
);
