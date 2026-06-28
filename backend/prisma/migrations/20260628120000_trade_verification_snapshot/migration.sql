-- CreateTable
CREATE TABLE "TradeVerificationSnapshot" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "observedStatus" TEXT NOT NULL,
    "expectedStatus" TEXT,
    "match" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeVerificationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeVerificationSnapshot_orderId_createdAt_idx" ON "TradeVerificationSnapshot"("orderId", "createdAt");
