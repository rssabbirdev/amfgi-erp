ALTER TABLE "Material"
ADD COLUMN "assemblyOutputQuantity" DECIMAL(18, 3) NOT NULL DEFAULT 1;

CREATE TABLE "MaterialAssemblyComponent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "assemblyMaterialId" TEXT NOT NULL,
  "componentMaterialId" TEXT NOT NULL,
  "quantity" DECIMAL(18, 3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialAssemblyComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialAssemblyComponent_assemblyMaterialId_componentMaterialId_key"
ON "MaterialAssemblyComponent"("assemblyMaterialId", "componentMaterialId");

CREATE INDEX "MaterialAssemblyComponent_companyId_assemblyMaterialId_idx"
ON "MaterialAssemblyComponent"("companyId", "assemblyMaterialId");

CREATE INDEX "MaterialAssemblyComponent_companyId_componentMaterialId_idx"
ON "MaterialAssemblyComponent"("companyId", "componentMaterialId");

ALTER TABLE "MaterialAssemblyComponent"
ADD CONSTRAINT "MaterialAssemblyComponent_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialAssemblyComponent"
ADD CONSTRAINT "MaterialAssemblyComponent_assemblyMaterial_fkey"
FOREIGN KEY ("companyId", "assemblyMaterialId") REFERENCES "Material"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MaterialAssemblyComponent"
ADD CONSTRAINT "MaterialAssemblyComponent_componentMaterial_fkey"
FOREIGN KEY ("companyId", "componentMaterialId") REFERENCES "Material"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
