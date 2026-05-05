ALTER TABLE "JobItem"
  ADD COLUMN "trackingItems" JSONB;

ALTER TABLE "JobItemProgressEntry"
  ADD COLUMN "trackerId" TEXT;

CREATE INDEX "JobItemProgressEntry_companyId_jobItemId_trackerId_entryDate_idx"
  ON "JobItemProgressEntry"("companyId", "jobItemId", "trackerId", "entryDate");
