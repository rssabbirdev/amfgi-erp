-- Job-level execution progress & schedule (single set per job).

ALTER TABLE "Job" ADD COLUMN "executionProgressStatus" "JobItemProgressStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Job" ADD COLUMN "executionProgressPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN "executionPlannedStartDate" DATE;
ALTER TABLE "Job" ADD COLUMN "executionPlannedEndDate" DATE;
ALTER TABLE "Job" ADD COLUMN "executionActualStartDate" DATE;
ALTER TABLE "Job" ADD COLUMN "executionActualEndDate" DATE;
ALTER TABLE "Job" ADD COLUMN "executionProgressNote" TEXT;
ALTER TABLE "Job" ADD COLUMN "executionProgressUpdatedAt" TIMESTAMP(3);

UPDATE "Job" j
SET
  "executionProgressStatus" = ji."progressStatus",
  "executionProgressPercent" = ji."progressPercent",
  "executionPlannedStartDate" = ji."plannedStartDate",
  "executionPlannedEndDate" = ji."plannedEndDate",
  "executionActualStartDate" = ji."actualStartDate",
  "executionActualEndDate" = ji."actualEndDate",
  "executionProgressNote" = ji."progressNote"
FROM (
  SELECT DISTINCT ON ("jobId")
    "jobId",
    "progressStatus",
    "progressPercent",
    "plannedStartDate",
    "plannedEndDate",
    "actualStartDate",
    "actualEndDate",
    "progressNote"
  FROM "JobItem"
  WHERE "isActive" = true
  ORDER BY "jobId", "sortOrder" ASC, "createdAt" ASC
) ji
WHERE j."id" = ji."jobId";
