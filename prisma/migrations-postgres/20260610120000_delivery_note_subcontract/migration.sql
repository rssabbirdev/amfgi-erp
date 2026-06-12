-- Dual-type delivery notes: DISPATCH vs SUBCONTRACT with material lines and transit status.

CREATE TYPE "DeliveryNoteType" AS ENUM ('DISPATCH', 'SUBCONTRACT');
CREATE TYPE "DeliveryNoteTransitStatus" AS ENUM ('ON_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED');

ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "deliveryType" "DeliveryNoteType" NOT NULL DEFAULT 'DISPATCH';
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "sourceWarehouseId" TEXT;
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "targetWarehouseId" TEXT;
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "transitStatus" "DeliveryNoteTransitStatus";
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "referenceJobId" TEXT;

CREATE INDEX IF NOT EXISTS "DeliveryNote_companyId_deliveryType_idx" ON "DeliveryNote"("companyId", "deliveryType");
CREATE INDEX IF NOT EXISTS "DeliveryNote_companyId_supplierId_idx" ON "DeliveryNote"("companyId", "supplierId");
CREATE INDEX IF NOT EXISTS "DeliveryNote_companyId_transitStatus_idx" ON "DeliveryNote"("companyId", "transitStatus");

CREATE TABLE IF NOT EXISTS "DeliveryNoteMaterialLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityUomId" TEXT,
    "issuedQty" DECIMAL(18,3) NOT NULL,
    "receivedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "sourceWarehouseId" TEXT NOT NULL,
    "targetWarehouseId" TEXT NOT NULL,
    "issueTransferOutId" TEXT,
    "issueTransferInId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNoteMaterialLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeliveryNoteMaterialLine_deliveryNoteId_sortOrder_idx" ON "DeliveryNoteMaterialLine"("deliveryNoteId", "sortOrder");
CREATE INDEX IF NOT EXISTS "DeliveryNoteMaterialLine_companyId_materialId_idx" ON "DeliveryNoteMaterialLine"("companyId", "materialId");

DO $fk$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNote_companyId_supplierId_fkey') THEN
    ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_supplierId_fkey"
      FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNote_companyId_sourceWarehouseId_fkey') THEN
    ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_sourceWarehouseId_fkey"
      FOREIGN KEY ("companyId", "sourceWarehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNote_companyId_targetWarehouseId_fkey') THEN
    ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_targetWarehouseId_fkey"
      FOREIGN KEY ("companyId", "targetWarehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNote_companyId_referenceJobId_fkey') THEN
    ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_referenceJobId_fkey"
      FOREIGN KEY ("companyId", "referenceJobId") REFERENCES "Job"("companyId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNoteMaterialLine_deliveryNoteId_fkey') THEN
    ALTER TABLE "DeliveryNoteMaterialLine" ADD CONSTRAINT "DeliveryNoteMaterialLine_deliveryNoteId_fkey"
      FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNoteMaterialLine_companyId_fkey') THEN
    ALTER TABLE "DeliveryNoteMaterialLine" ADD CONSTRAINT "DeliveryNoteMaterialLine_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNoteMaterialLine_companyId_materialId_fkey') THEN
    ALTER TABLE "DeliveryNoteMaterialLine" ADD CONSTRAINT "DeliveryNoteMaterialLine_companyId_materialId_fkey"
      FOREIGN KEY ("companyId", "materialId") REFERENCES "Material"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNoteMaterialLine_companyId_sourceWarehouseId_fkey') THEN
    ALTER TABLE "DeliveryNoteMaterialLine" ADD CONSTRAINT "DeliveryNoteMaterialLine_companyId_sourceWarehouseId_fkey"
      FOREIGN KEY ("companyId", "sourceWarehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNoteMaterialLine_companyId_targetWarehouseId_fkey') THEN
    ALTER TABLE "DeliveryNoteMaterialLine" ADD CONSTRAINT "DeliveryNoteMaterialLine_companyId_targetWarehouseId_fkey"
      FOREIGN KEY ("companyId", "targetWarehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $fk$;

UPDATE "DeliveryNote" SET "deliveryType" = 'DISPATCH' WHERE "deliveryType" IS NULL;
