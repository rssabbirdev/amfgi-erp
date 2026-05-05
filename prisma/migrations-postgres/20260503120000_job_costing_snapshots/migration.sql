CREATE TYPE "JobCostingSnapshotStatus" AS ENUM ('SAVED', 'APPROVED', 'SUPERSEDED');

CREATE TABLE "JobCostingSnapshot" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "JobCostingSnapshotStatus" NOT NULL DEFAULT 'SAVED',
  "pricingMode" TEXT NOT NULL,
  "postingDate" TIMESTAMP(3) NOT NULL,
  "jobItemIds" JSONB,
  "customUnitCosts" JSONB,
  "pricingSnapshots" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "totalQuotedMaterialCost" DECIMAL(18,4) NOT NULL,
  "totalActualMaterialCost" DECIMAL(18,4) NOT NULL,
  "totalEstimatedCompletionDays" DECIMAL(18,4) NOT NULL,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobCostingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobCostingSnapshot_companyId_id_key"
  ON "JobCostingSnapshot"("companyId", "id");

CREATE UNIQUE INDEX "JobCostingSnapshot_companyId_jobId_versionNumber_key"
  ON "JobCostingSnapshot"("companyId", "jobId", "versionNumber");

CREATE INDEX "JobCostingSnapshot_companyId_jobId_createdAt_idx"
  ON "JobCostingSnapshot"("companyId", "jobId", "createdAt");

ALTER TABLE "JobCostingSnapshot"
  ADD CONSTRAINT "JobCostingSnapshot_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobCostingSnapshot"
  ADD CONSTRAINT "JobCostingSnapshot_companyId_jobId_fkey"
  FOREIGN KEY ("companyId", "jobId") REFERENCES "Job"("companyId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
