-- CreateEnum
CREATE TYPE "WarehouseMode" AS ENUM ('DISABLED', 'OPTIONAL', 'REQUIRED');

-- AlterTable
ALTER TABLE "Company"
ADD COLUMN "warehouseMode" "WarehouseMode" NOT NULL DEFAULT 'DISABLED',
ADD COLUMN "stockFallbackWarehouseId" TEXT;

-- AlterTable
ALTER TABLE "Warehouse"
ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StockBatch"
ADD COLUMN "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "warehouseId" TEXT;

-- CreateTable
CREATE TABLE "MaterialWarehouseStock" (
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "currentStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialWarehouseStock_pkey" PRIMARY KEY ("companyId","materialId","warehouseId")
);

-- CreateIndex
CREATE INDEX "Company_stockFallbackWarehouseId_idx" ON "Company"("stockFallbackWarehouseId");

-- CreateIndex
CREATE INDEX "StockBatch_companyId_warehouseId_materialId_receivedDate_idx" ON "StockBatch"("companyId", "warehouseId", "materialId", "receivedDate");

-- CreateIndex
CREATE INDEX "Transaction_companyId_warehouseId_materialId_date_idx" ON "Transaction"("companyId", "warehouseId", "materialId", "date");

-- CreateIndex
CREATE INDEX "MaterialWarehouseStock_companyId_warehouseId_idx" ON "MaterialWarehouseStock"("companyId", "warehouseId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_stockFallbackWarehouseId_fkey" FOREIGN KEY ("stockFallbackWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWarehouseStock" ADD CONSTRAINT "MaterialWarehouseStock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWarehouseStock" ADD CONSTRAINT "MaterialWarehouseStock_companyId_materialId_fkey" FOREIGN KEY ("companyId", "materialId") REFERENCES "Material"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWarehouseStock" ADD CONSTRAINT "MaterialWarehouseStock_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
