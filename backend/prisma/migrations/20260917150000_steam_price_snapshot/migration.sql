-- CreateTable
CREATE TABLE "SteamPriceSnapshot" (
    "id" TEXT NOT NULL,
    "marketHashName" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteamPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SteamPriceSnapshot_marketHashName_recordedAt_idx" ON "SteamPriceSnapshot"("marketHashName", "recordedAt" DESC);

-- Seed one snapshot from current cache so history can start accruing.
INSERT INTO "SteamPriceSnapshot" ("id", "marketHashName", "priceMinor", "recordedAt")
SELECT
  'seed_' || md5("marketHashName" || ':' || "fetchedAt"::text),
  "marketHashName",
  "priceMinor",
  "fetchedAt"
FROM "SteamPriceCache"
WHERE "priceMinor" IS NOT NULL AND "priceMinor" > 0;
