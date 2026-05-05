ALTER TABLE "JobItem"
  ADD COLUMN "trackingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trackingLabel" VARCHAR(120),
  ADD COLUMN "trackingUnit" VARCHAR(40),
  ADD COLUMN "trackingTargetValue" DECIMAL(18,3),
  ADD COLUMN "trackingSourceKey" VARCHAR(180);

CREATE TABLE "JobItemProgressEntry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobItemId" TEXT NOT NULL,
  "entryDate" DATE NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "JobItemProgressEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobItemProgressEntry_companyId_id_key" ON "JobItemProgressEntry"("companyId", "id");
CREATE INDEX "JobItemProgressEntry_companyId_jobItemId_entryDate_idx" ON "JobItemProgressEntry"("companyId", "jobItemId", "entryDate");

ALTER TABLE "JobItemProgressEntry"
  ADD CONSTRAINT "JobItemProgressEntry_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobItemProgressEntry"
  ADD CONSTRAINT "JobItemProgressEntry_companyId_jobItemId_fkey"
  FOREIGN KEY ("companyId", "jobItemId") REFERENCES "JobItem"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
