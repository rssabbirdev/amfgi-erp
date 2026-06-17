-- Company holidays (payroll), holiday pay-type links, and WPS transfer on compensation.

-- AlterTable
ALTER TABLE "EmployeeCompensation" ADD COLUMN "wpsTransferAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "CompanyHoliday" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "holidayDate" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "employmentTypes" JSONB NOT NULL DEFAULT '[]',
    "workforceRoleTypes" JSONB NOT NULL DEFAULT '[]',
    "visaHoldings" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyHolidayPayType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyHolidayId" TEXT NOT NULL,
    "payTypeId" TEXT NOT NULL,
    "payWorkedHoursAtOt" BOOLEAN NOT NULL DEFAULT true,
    "holidayOtPercent" INTEGER,

    CONSTRAINT "CompanyHolidayPayType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyHoliday_companyId_holidayDate_idx" ON "CompanyHoliday"("companyId", "holidayDate");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHoliday_companyId_id_key" ON "CompanyHoliday"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHoliday_companyId_holidayDate_key" ON "CompanyHoliday"("companyId", "holidayDate");

-- CreateIndex
CREATE INDEX "CompanyHolidayPayType_companyId_companyHolidayId_idx" ON "CompanyHolidayPayType"("companyId", "companyHolidayId");

-- CreateIndex
CREATE INDEX "CompanyHolidayPayType_companyId_payTypeId_idx" ON "CompanyHolidayPayType"("companyId", "payTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyHolidayPayType_companyHolidayId_payTypeId_key" ON "CompanyHolidayPayType"("companyHolidayId", "payTypeId");

-- AddForeignKey
ALTER TABLE "CompanyHoliday" ADD CONSTRAINT "CompanyHoliday_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHolidayPayType" ADD CONSTRAINT "CompanyHolidayPayType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHolidayPayType" ADD CONSTRAINT "CompanyHolidayPayType_companyId_companyHolidayId_fkey" FOREIGN KEY ("companyId", "companyHolidayId") REFERENCES "CompanyHoliday"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyHolidayPayType" ADD CONSTRAINT "CompanyHolidayPayType_companyId_payTypeId_fkey" FOREIGN KEY ("companyId", "payTypeId") REFERENCES "PayType"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
