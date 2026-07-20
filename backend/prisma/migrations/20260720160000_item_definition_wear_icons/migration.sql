-- Per-wear preview icons for catalog cards (FN/MW/FT/...).
ALTER TABLE "ItemDefinition" ADD COLUMN IF NOT EXISTS "wearIcons" JSONB;
