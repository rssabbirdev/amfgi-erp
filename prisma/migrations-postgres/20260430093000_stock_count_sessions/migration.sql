CREATE TYPE "StockCountSessionStatus" AS ENUM (
  'DRAFT',
  'ADJUSTMENT_PENDING',
  'ADJUSTMENT_APPROVED',
  'ADJUSTMENT_REJECTED',
  'CANCELLED'
);

CREATE TABLE "StockCountSession" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "StockCountSessionStatus" NOT NULL DEFAULT 'DRAFT',
  "evidenceReference" TEXT,
  "evidenceNotes" TEXT,
  "notes" TEXT,
  "currentRevision" INTEGER NOT NULL DEFAULT 1,
  "linkedAdjustmentApprovalId" TEXT,
  "linkedAdjustmentReferenceNumber" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockCountSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockCountSessionLine" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "materialName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "systemQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "countedQty" DECIMAL(18,3),
  "varianceQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockCountSessionLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockCountSessionRevision" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "savedById" TEXT,
  "savedByName" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockCountSessionRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockCountSession_companyId_status_createdAt_idx" ON "StockCountSession"("companyId", "status", "createdAt");
CREATE INDEX "StockCountSession_companyId_warehouseId_status_idx" ON "StockCountSession"("companyId", "warehouseId", "status");
CREATE INDEX "StockCountSessionLine_sessionId_sortOrder_idx" ON "StockCountSessionLine"("sessionId", "sortOrder");
CREATE INDEX "StockCountSessionRevision_sessionId_revisionNumber_idx" ON "StockCountSessionRevision"("sessionId", "revisionNumber");
CREATE INDEX "StockCountSessionRevision_createdAt_idx" ON "StockCountSessionRevision"("createdAt");

ALTER TABLE "StockCountSession"
  ADD CONSTRAINT "StockCountSession_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockCountSession"
  ADD CONSTRAINT "StockCountSession_companyId_warehouseId_fkey"
  FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockCountSessionLine"
  ADD CONSTRAINT "StockCountSessionLine_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "StockCountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockCountSessionRevision"
  ADD CONSTRAINT "StockCountSessionRevision_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "StockCountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
