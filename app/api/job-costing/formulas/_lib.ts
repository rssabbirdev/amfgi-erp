import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const FormulaConstantSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  value: z.union([z.number(), z.string().min(1)]),
  unit: z.string().max(40).optional(),
});

export const FormulaMaterialRuleSchema = z
  .object({
    materialId: z.string().min(1).optional(),
    materialSelectorKey: z.string().min(1).max(80).optional(),
    quantityExpression: z.string().min(1),
    quantityUomId: z.string().optional(),
    wastePercent: z.number().min(0).max(1000).optional(),
  })
  .refine((value) => value.materialId || value.materialSelectorKey, {
    message: 'Material rule must include a fixed material or a job material selector',
  });

export const FormulaConfigSchema = z.object({
  version: z.number().int().min(1).default(1),
  unitSystem: z.literal('METRIC').optional(),
  variables: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  constants: z.array(FormulaConstantSchema).optional(),
  defaultMaterialSelections: z.record(z.string(), z.string().min(1)).optional(),
  areas: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        label: z.string().min(1).max(120),
        measurementsPath: z.string().optional(),
        variables: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
        materials: z.array(FormulaMaterialRuleSchema),
        labor: z.array(
          z.object({
            expertiseName: z.string().min(1).max(120),
            quantityExpression: z.string().optional(),
            crewSizeExpression: z.string().optional(),
            productivityPerWorkerPerDay: z.string().min(1),
          })
        ),
      })
    )
    .min(1),
});

export const FormulaLibrarySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  fabricationType: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  specificationSchema: z.unknown().optional(),
  formulaConfig: FormulaConfigSchema,
  saveMode: z.enum(['manual', 'auto']).optional(),
  changeNote: z.string().max(500).optional(),
});

export const FormulaLibraryUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  fabricationType: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  specificationSchema: z.unknown().nullable().optional(),
  formulaConfig: FormulaConfigSchema.optional(),
  isActive: z.boolean().optional(),
  saveMode: z.enum(['manual', 'auto']).optional(),
  changeNote: z.string().max(500).optional(),
});

export const RestoreFormulaVersionSchema = z.object({
  versionId: z.string().min(1),
  changeNote: z.string().max(500).optional(),
});

type FormulaSnapshotRow = {
  companyId: string;
  id: string;
  name: string;
  slug: string;
  fabricationType: string;
  description: string | null;
  specificationSchema: Prisma.JsonValue | null;
  formulaConfig: Prisma.JsonValue;
};

export function formulaSnapshotData(row: FormulaSnapshotRow, versionNumber: number, createdBy: string, changeNote?: string | null) {
  return {
    companyId: row.companyId,
    formulaLibraryId: row.id,
    versionNumber,
    name: row.name,
    slug: row.slug,
    fabricationType: row.fabricationType,
    description: row.description ?? null,
    specificationSchema: row.specificationSchema == null ? Prisma.JsonNull : (row.specificationSchema as Prisma.InputJsonValue),
    formulaConfig: row.formulaConfig as Prisma.InputJsonValue,
    changeNote: changeNote?.trim() ? changeNote.trim() : null,
    createdBy,
  };
}

export function formulaChanged(
  current: FormulaSnapshotRow,
  next: {
    name?: string;
    slug?: string;
    fabricationType?: string;
    description?: string | null;
    specificationSchema?: unknown | null;
    formulaConfig?: unknown;
  }
) {
  return (
    (next.name ?? current.name) !== current.name ||
    (next.slug ?? current.slug) !== current.slug ||
    (next.fabricationType ?? current.fabricationType) !== current.fabricationType ||
    (next.description ?? current.description ?? null) !== (current.description ?? null) ||
    (next.specificationSchema !== undefined &&
      JSON.stringify(next.specificationSchema) !== JSON.stringify(current.specificationSchema)) ||
    (next.formulaConfig !== undefined && JSON.stringify(next.formulaConfig) !== JSON.stringify(current.formulaConfig))
  );
}
