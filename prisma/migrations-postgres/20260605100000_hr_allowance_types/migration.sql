-- CreateTable
CREATE TABLE "AllowanceType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowanceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAllowance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "allowanceTypeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllowanceType_companyId_isActive_idx" ON "AllowanceType"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AllowanceType_companyId_id_key" ON "AllowanceType"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AllowanceType_companyId_code_key" ON "AllowanceType"("companyId", "code");

-- CreateIndex
CREATE INDEX "EmployeeAllowance_companyId_employeeId_idx" ON "EmployeeAllowance"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeAllowance_companyId_allowanceTypeId_idx" ON "EmployeeAllowance"("companyId", "allowanceTypeId");

-- CreateIndex
CREATE INDEX "EmployeeAllowance_companyId_effectiveFrom_idx" ON "EmployeeAllowance"("companyId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "AllowanceType" ADD CONSTRAINT "AllowanceType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_companyId_employeeId_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAllowance" ADD CONSTRAINT "EmployeeAllowance_companyId_allowanceTypeId_fkey" FOREIGN KEY ("companyId", "allowanceTypeId") REFERENCES "AllowanceType"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
