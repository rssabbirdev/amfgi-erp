CREATE TYPE "JobItemProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD');

ALTER TABLE "JobItem"
  ADD COLUMN "progressStatus" "JobItemProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "progressPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "plannedStartDate" DATE,
  ADD COLUMN "plannedEndDate" DATE,
  ADD COLUMN "actualStartDate" DATE,
  ADD COLUMN "actualEndDate" DATE,
  ADD COLUMN "progressNote" TEXT,
  ADD COLUMN "progressUpdatedAt" TIMESTAMP(3);
