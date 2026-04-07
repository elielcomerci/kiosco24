ALTER TABLE "PlatformBusinessActivity"
ADD COLUMN IF NOT EXISTS "defaultCategoryNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "PlatformPriceObservation" (
  id TEXT PRIMARY KEY,
  "platformProductId" TEXT NULL,
  "scrapedProductId" TEXT NULL,
  "scrapeRunId" TEXT NULL,
  "businessActivity" TEXT NOT NULL DEFAULT 'KIOSCO',
  barcode TEXT NULL,
  source "ScraperSource" NOT NULL,
  "sourceUrl" TEXT NULL,
  "observedPriceRaw" TEXT NOT NULL,
  "observedPriceValue" DOUBLE PRECISION NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isOutlier" BOOLEAN NOT NULL DEFAULT FALSE,
  "outlierReason" TEXT NULL,
  snapshot JSONB NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PlatformPriceObservation_scrapedProductId_key'
  ) THEN
    ALTER TABLE "PlatformPriceObservation"
    DROP CONSTRAINT "PlatformPriceObservation_scrapedProductId_key";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PlatformPriceObservation_platformProductId_fkey'
  ) THEN
    ALTER TABLE "PlatformPriceObservation"
    ADD CONSTRAINT "PlatformPriceObservation_platformProductId_fkey"
    FOREIGN KEY ("platformProductId") REFERENCES "PlatformProduct"(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PlatformPriceObservation_scrapedProductId_fkey'
  ) THEN
    ALTER TABLE "PlatformPriceObservation"
    ADD CONSTRAINT "PlatformPriceObservation_scrapedProductId_fkey"
    FOREIGN KEY ("scrapedProductId") REFERENCES "ScrapedProduct"(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PlatformPriceObservation_scrapeRunId_fkey'
  ) THEN
    ALTER TABLE "PlatformPriceObservation"
    ADD CONSTRAINT "PlatformPriceObservation_scrapeRunId_fkey"
    FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PlatformPriceObservation_platformProductId_observedAt_idx"
ON "PlatformPriceObservation" ("platformProductId", "observedAt");

CREATE INDEX IF NOT EXISTS "PlatformPriceObservation_barcode_observedAt_idx"
ON "PlatformPriceObservation" (barcode, "observedAt");

CREATE INDEX IF NOT EXISTS "PlatformPriceObservation_businessActivity_observedAt_idx"
ON "PlatformPriceObservation" ("businessActivity", "observedAt");

CREATE INDEX IF NOT EXISTS "PlatformPriceObservation_source_observedAt_idx"
ON "PlatformPriceObservation" (source, "observedAt");

CREATE INDEX IF NOT EXISTS "PlatformPriceObservation_scrapeRunId_observedAt_idx"
ON "PlatformPriceObservation" ("scrapeRunId", "observedAt");
