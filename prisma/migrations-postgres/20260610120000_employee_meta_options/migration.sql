-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "EmployeeMetaKind" AS ENUM ('DESIGNATION', 'DEPARTMENT', 'EMPLOYMENT_TYPE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmployeeMetaOption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "EmployeeMetaKind" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeMetaOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeMetaOption_companyId_id_key" ON "EmployeeMetaOption"("companyId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeMetaOption_companyId_kind_name_key" ON "EmployeeMetaOption"("companyId", "kind", "name");
CREATE INDEX IF NOT EXISTS "EmployeeMetaOption_companyId_kind_isActive_sortOrder_idx" ON "EmployeeMetaOption"("companyId", "kind", "isActive", "sortOrder");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "EmployeeMetaOption" ADD CONSTRAINT "EmployeeMetaOption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
