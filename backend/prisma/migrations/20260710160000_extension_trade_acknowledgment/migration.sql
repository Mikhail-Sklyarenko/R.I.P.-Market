-- CreateTable
CREATE TABLE "TradeAcknowledgment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "offerId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeAcknowledgment_idempotencyKey_key" ON "TradeAcknowledgment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TradeAcknowledgment_orderId_role_type_idx" ON "TradeAcknowledgment"("orderId", "role", "type");

-- CreateIndex
CREATE INDEX "TradeAcknowledgment_userId_createdAt_idx" ON "TradeAcknowledgment"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TradeAcknowledgment" ADD CONSTRAINT "TradeAcknowledgment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAcknowledgment" ADD CONSTRAINT "TradeAcknowledgment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
