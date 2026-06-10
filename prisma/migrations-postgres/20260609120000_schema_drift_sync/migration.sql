-- Idempotent drift sync: safe when objects were already applied via db push.

DO $$ BEGIN
    CREATE TYPE "AttendanceLeaveType" AS ENUM ('ANNUAL', 'SICK', 'EMERGENCY', 'ONE_DAY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "SalaryComponentKind" AS ENUM ('EARNING', 'DEDUCTION');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "SalaryComponentApplication" AS ENUM ('FIXED_MONTHLY', 'ATTENDANCE_PRESENT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE "AttendanceSource" ADD VALUE 'LEAVE_REQUEST';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AllowanceType"
    ADD COLUMN IF NOT EXISTS "componentKind" "SalaryComponentKind" NOT NULL DEFAULT 'EARNING',
    ADD COLUMN IF NOT EXISTS "applicationMode" "SalaryComponentApplication" NOT NULL DEFAULT 'ATTENDANCE_PRESENT';

ALTER TABLE "AttendanceEntry"
    ADD COLUMN IF NOT EXISTS "basicHours" DECIMAL(4,2) NOT NULL DEFAULT 8,
    ADD COLUMN IF NOT EXISTS "leaveType" "AttendanceLeaveType";

ALTER TABLE "Material"
    ADD COLUMN IF NOT EXISTS "assemblyUseDynamicCost" BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'DispatchEntryRevision_jobId_fkey'
    ) THEN
        ALTER TABLE "DispatchEntryRevision"
            RENAME CONSTRAINT "DispatchEntryRevision_jobId_fkey"
            TO "DispatchEntryRevision_companyId_jobId_fkey";
    END IF;
END $$;
