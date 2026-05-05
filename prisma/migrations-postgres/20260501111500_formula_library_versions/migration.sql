CREATE TABLE "FormulaLibraryVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "formulaLibraryId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fabricationType" TEXT NOT NULL,
    "description" TEXT,
    "specificationSchema" JSONB,
    "formulaConfig" JSONB NOT NULL,
    "changeNote" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormulaLibraryVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormulaLibraryVersion_companyId_id_key" ON "FormulaLibraryVersion"("companyId", "id");
CREATE UNIQUE INDEX "FormulaLibraryVersion_companyId_formulaLibraryId_versionNumbe_key" ON "FormulaLibraryVersion"("companyId", "formulaLibraryId", "versionNumber");
CREATE INDEX "FormulaLibraryVersion_companyId_formulaLibraryId_createdAt_idx" ON "FormulaLibraryVersion"("companyId", "formulaLibraryId", "createdAt");

ALTER TABLE "FormulaLibraryVersion" ADD CONSTRAINT "FormulaLibraryVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormulaLibraryVersion" ADD CONSTRAINT "FormulaLibraryVersion_companyId_formulaLibraryId_fkey" FOREIGN KEY ("companyId", "formulaLibraryId") REFERENCES "FormulaLibrary"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
