-- CreateEnum
CREATE TYPE "AttendanceLeaveType" AS ENUM ('ANNUAL', 'SICK', 'EMERGENCY', 'ONE_DAY');

-- CreateEnum
CREATE TYPE "SalaryComponentKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "SalaryComponentApplication" AS ENUM ('FIXED_MONTHLY', 'ATTENDANCE_PRESENT');

-- AlterEnum
ALTER TYPE "AttendanceSource" ADD VALUE 'LEAVE_REQUEST';

-- AlterTable
ALTER TABLE "AllowanceType" ADD COLUMN "componentKind" "SalaryComponentKind" NOT NULL DEFAULT 'EARNING',
ADD COLUMN "applicationMode" "SalaryComponentApplication" NOT NULL DEFAULT 'ATTENDANCE_PRESENT';

-- AlterTable
ALTER TABLE "AttendanceEntry" ADD COLUMN "basicHours" DECIMAL(4,2) NOT NULL DEFAULT 8,
ADD COLUMN "leaveType" "AttendanceLeaveType";

-- AlterTable
ALTER TABLE "Material" ADD COLUMN "assemblyUseDynamicCost" BOOLEAN NOT NULL DEFAULT true;

-- RenameForeignKey
ALTER TABLE "DispatchEntryRevision" RENAME CONSTRAINT "DispatchEntryRevision_jobId_fkey" TO "DispatchEntryRevision_companyId_jobId_fkey";
