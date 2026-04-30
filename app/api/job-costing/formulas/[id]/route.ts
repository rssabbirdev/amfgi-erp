import { auth } from '@/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const FormulaConstantSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  value: z.union([z.number(), z.string().min(1)]),
  unit: z.string().max(40).optional(),
});

const FormulaMaterialRuleSchema = z
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

const FormulaConfigSchema = z.object({
  version: z.number().int().min(1).default(1),
  unitSystem: z.literal('METRIC').optional(),
  variables: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  constants: z.array(FormulaConstantSchema).optional(),
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

const FormulaLibraryUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  fabricationType: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  specificationSchema: z.unknown().nullable().optional(),
  formulaConfig: FormulaConfigSchema.optional(),
  isActive: z.boolean().optional(),
});

async function loadFormula(id: string, companyId: string) {
  return prisma.formulaLibrary.findFirst({
    where: { id, companyId },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !session.user.isSuperAdmin &&
    (!session.user.permissions.includes(P.JOB_VIEW) || !session.user.permissions.includes(P.MATERIAL_VIEW))
  ) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const { id } = await params;
  const row = await loadFormula(id, session.user.activeCompanyId);
  if (!row) return errorResponse('Formula library item not found', 404);
  return successResponse(row);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.SETTINGS_MANAGE)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const existing = await loadFormula(id, session.user.activeCompanyId);
  if (!existing) return errorResponse('Formula library item not found', 404);

  const body = await req.json();
  const parsed = FormulaLibraryUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const row = await prisma.formulaLibrary.update({
    where: { id },
    data: {
      ...parsed.data,
      specificationSchema:
        parsed.data.specificationSchema === undefined
          ? undefined
          : parsed.data.specificationSchema == null
            ? Prisma.JsonNull
            : (parsed.data.specificationSchema as Prisma.InputJsonValue),
      formulaConfig:
        parsed.data.formulaConfig === undefined
          ? undefined
          : (parsed.data.formulaConfig as Prisma.InputJsonValue),
    },
  });

  return successResponse(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.SETTINGS_MANAGE)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const existing = await loadFormula(id, session.user.activeCompanyId);
  if (!existing) return errorResponse('Formula library item not found', 404);

  const linkedItems = await prisma.jobItem.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      formulaLibraryId: id,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      job: {
        select: {
          id: true,
          jobNumber: true,
          description: true,
        },
      },
    },
    orderBy: [
      { job: { jobNumber: 'asc' } },
      { name: 'asc' },
    ],
    take: 25,
  });

  if (linkedItems.length > 0) {
    return errorResponse(
      'Formula is linked to active job items and cannot be deleted',
      409,
      {
        formulaId: id,
        formulaName: existing.name,
        linkedJobItemCount: linkedItems.length,
        linkedJobItems: linkedItems.map((item) => ({
          id: item.id,
          itemName: item.name,
          jobId: item.job.id,
          jobNumber: item.job.jobNumber,
          jobDescription: item.job.description,
        })),
      }
    );
  }

  await prisma.formulaLibrary.delete({ where: { id } });
  return successResponse({ deleted: true });
}
