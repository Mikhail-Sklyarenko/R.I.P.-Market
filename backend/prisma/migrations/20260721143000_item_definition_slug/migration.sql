-- SEO-friendly catalog item URLs.
ALTER TABLE "ItemDefinition" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "ItemDefinition_slug_key" ON "ItemDefinition"("slug");
