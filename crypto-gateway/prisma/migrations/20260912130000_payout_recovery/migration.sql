ALTER TABLE "Withdrawal" ADD COLUMN "externalId" TEXT, ADD COLUMN "debitSource" TEXT NOT NULL DEFAULT 'gateway_balance',
 ADD COLUMN "signedTransaction" JSONB, ADD COLUMN "leaseUntil" TIMESTAMP(3);
CREATE UNIQUE INDEX "Withdrawal_externalId_key" ON "Withdrawal" ("externalId");
ALTER TABLE "WalletCounter" ALTER COLUMN "next" SET DEFAULT 1;
UPDATE "WalletCounter" SET "next" = GREATEST("next", 1);
-- Index 0 is permanently reserved for the signer. Existing address owners require manual migration.

UPDATE "Withdrawal" SET "failReason" = 'LEGACY_UNKNOWN_RESULT' WHERE status = 'processing' AND "payoutTxHash" IS NULL;
