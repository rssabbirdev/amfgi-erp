DO $$
BEGIN
  CREATE TYPE "JobCostingSnapshotStatus" AS ENUM ('SAVED', 'APPROVED', 'SUPERSEDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "JobCostingSnapshot"
  ADD COLUMN IF NOT EXISTS "status" "JobCostingSnapshotStatus" NOT NULL DEFAULT 'SAVED',
  ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

UPDATE "JobCostingSnapshot"
SET "status" = 'SAVED'
WHERE "status" IS NULL;
