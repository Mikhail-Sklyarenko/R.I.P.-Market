CREATE TABLE "AuthExchangeCode" ("codeHash" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "purpose" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "AuthExchangeCode_expiresAt_idx" ON "AuthExchangeCode"("expiresAt");
