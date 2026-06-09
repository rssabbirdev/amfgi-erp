-- CreateTable
CREATE TABLE "PayType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payTypeId" TEXT NOT NULL,
    "visaPeriodId" TEXT,
    "monthlyBasic" DECIMAL(12,2),
    "monthlyAllowance" DECIMAL(12,2),
    "dailyRate" DECIMAL(12,2),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "EmployeeAllowance" ADD COLUMN "employeeCompensationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PayType_companyId_id_key" ON "PayType"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PayType_companyId_code_key" ON "PayType"("companyId", "code");

-- CreateIndex
CREATE INDEX "PayType_companyId_isActive_idx" ON "PayType"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCompensation_companyId_id_key" ON "EmployeeCompensation"("companyId", "id");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_companyId_employeeId_idx" ON "EmployeeCompensation"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_companyId_payTypeId_idx" ON "EmployeeCompensation"("companyId", "payTypeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_companyId_visaPeriodId_idx" ON "EmployeeCompensation"("companyId", "visaPeriodId");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_companyId_effectiveFrom_idx" ON "EmployeeCompensation"("companyId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmployeeAllowance_companyId_employeeCompensationId_idx" ON "EmployeeAllowance"("companyId", "employeeCompensationId");

-- AddForeignKey
ALTER TABLE "PayType" ADD CONSTRAINT "PayType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_companyId_payTypeId_fkey" FOREIGN KEY ("companyId", "payTypeId") REFERENCES "PayType"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_companyId_visaPeriodId_fkey" FOREIGN KEY ("companyId", "visaPeriodId") REFERENCES "VisaPeriod"("companyId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_companyId_employeeCompensationId_fkey" FOREIGN KEY ("companyId", "employeeCompensationId") REFERENCES "EmployeeCompensation"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
