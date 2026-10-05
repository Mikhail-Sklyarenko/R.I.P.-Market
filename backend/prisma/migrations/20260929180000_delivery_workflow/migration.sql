BEGIN;
ALTER TABLE "TradeOperation"
 ADD COLUMN "verificationStage" TEXT NOT NULL DEFAULT 'WAITING_FOR_STEAM',
 ADD COLUMN "nextVerificationAt" TIMESTAMP(3),
 ADD COLUMN "verificationLeaseUntil" TIMESTAMP(3),
 ADD COLUMN "verificationLeaseToken" TEXT,
 ADD COLUMN "nextPreparationAt" TIMESTAMP(3),
 ADD COLUMN "inventoryBaseline" JSONB,
 ADD COLUMN "deliveryProof" JSONB,
 ADD COLUMN "tradeBinding" TEXT;
CREATE UNIQUE INDEX "TradeOperation_tradeBinding_key" ON "TradeOperation"("tradeBinding");
CREATE TABLE "SteamMappingLease" (
 "steamId" TEXT PRIMARY KEY,
 "orderId" TEXT NOT NULL,
 "leaseUntil" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SteamMappingLease_orderId_idx" ON "SteamMappingLease"("orderId");
CREATE FUNCTION prevent_delivery_proof_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."deliveryProof" IS NOT NULL AND NEW."deliveryProof" IS DISTINCT FROM OLD."deliveryProof" THEN
   RAISE EXCEPTION 'Delivery proof is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "TradeOperation_immutable_delivery_proof" BEFORE UPDATE ON "TradeOperation"
FOR EACH ROW EXECUTE FUNCTION prevent_delivery_proof_mutation();

COMMIT;
