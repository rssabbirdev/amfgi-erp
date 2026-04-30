-- CreateEnum
CREATE TYPE "StockExceptionType" AS ENUM ('DISPATCH_OVERRIDE', 'RECEIPT_ADJUSTMENT', 'RECEIPT_CANCELLATION');

-- CreateEnum
CREATE TYPE "StockExceptionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "StockExceptionApproval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "exceptionType" "StockExceptionType" NOT NULL,
    "status" "StockExceptionApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "referenceId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,

    CONSTRAINT "StockExceptionApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockExceptionApproval_companyId_exceptionType_referenceId_key" ON "StockExceptionApproval"("companyId", "exceptionType", "referenceId");

-- CreateIndex
CREATE INDEX "StockExceptionApproval_companyId_status_createdAt_idx" ON "StockExceptionApproval"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockExceptionApproval_companyId_exceptionType_createdAt_idx" ON "StockExceptionApproval"("companyId", "exceptionType", "createdAt");

-- AddForeignKey
ALTER TABLE "StockExceptionApproval" ADD CONSTRAINT "StockExceptionApproval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
