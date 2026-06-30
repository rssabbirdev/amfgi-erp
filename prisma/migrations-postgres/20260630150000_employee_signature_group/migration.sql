-- AlterEnum
ALTER TYPE "EmployeeMetaKind" ADD VALUE IF NOT EXISTS 'SIGNATURE_GROUP';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "signatureGroup" TEXT;
