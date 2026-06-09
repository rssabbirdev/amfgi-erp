-- CreateEnum
CREATE TYPE "PayRunStatus" AS ENUM ('FINALIZED');

-- CreateTable
CREATE TABLE "PayRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PayRunStatus" NOT NULL DEFAULT 'FINALIZED',
    "totalGross" DECIMAL(14,2) NOT NULL,
    "employeeCount" INTEGER NOT NULL,
    "includedCount" INTEGER NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRunLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "payTypeId" TEXT,
    "payTypeName" TEXT,
    "payTypeCode" TEXT,
    "compensationEffectiveFrom" DATE,
    "gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "breakdown" JSONB NOT NULL,
    "dayDetails" JSONB,
    "approvedAttendanceRows" INTEGER NOT NULL DEFAULT 0,
    "draftAttendanceRows" INTEGER NOT NULL DEFAULT 0,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,

    CONSTRAINT "PayRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayRun_companyId_createdAt_idx" ON "PayRun"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayRun_companyId_id_key" ON "PayRun"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PayRun_companyId_month_key" ON "PayRun"("companyId", "month");

-- CreateIndex
CREATE INDEX "PayRunLine_companyId_payRunId_idx" ON "PayRunLine"("companyId", "payRunId");

-- CreateIndex
CREATE INDEX "PayRunLine_companyId_employeeId_idx" ON "PayRunLine"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayRun" ADD CONSTRAINT "PayRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_companyId_payRunId_fkey" FOREIGN KEY ("companyId", "payRunId") REFERENCES "PayRun"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
