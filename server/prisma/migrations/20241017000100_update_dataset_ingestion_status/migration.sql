-- AlterTable
ALTER TABLE "DatasetIngestion" RENAME COLUMN "processedAt" TO "completedAt";

ALTER TABLE "DatasetIngestion"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN "failedAt" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN "errorMessage" TEXT;

ALTER TABLE "DatasetIngestion"
  ADD CONSTRAINT "DatasetIngestion_status_check" CHECK ("status" IN ('PENDING','RUNNING','COMPLETED','FAILED'));

ALTER TABLE "DatasetIngestion"
  ADD CONSTRAINT "DatasetIngestion_trigger_check" CHECK ("trigger" IN ('MANUAL','SCHEDULED'));

-- Backfill data for new columns
UPDATE "DatasetIngestion"
SET "startedAt" = COALESCE("startedAt", "createdAt", NOW());

UPDATE "DatasetIngestion"
SET "status" = CASE
  WHEN "completedAt" IS NOT NULL THEN 'COMPLETED'
  ELSE 'PENDING'
END
WHERE "status" <> 'COMPLETED';
