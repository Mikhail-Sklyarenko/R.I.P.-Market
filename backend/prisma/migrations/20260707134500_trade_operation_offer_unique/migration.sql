CREATE UNIQUE INDEX "TradeOperation_externalOfferId_key"
ON "TradeOperation"("externalOfferId")
WHERE "externalOfferId" IS NOT NULL;
