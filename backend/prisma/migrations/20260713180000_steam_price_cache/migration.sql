-- CreateTable
CREATE TABLE "SteamPriceCache" (
    "marketHashName" TEXT NOT NULL,
    "priceMinor" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteamPriceCache_pkey" PRIMARY KEY ("marketHashName")
);
