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

const FormulaLibrarySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  fabricationType: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  specificationSchema: z.unknown().optional(),
  formulaConfig: z.object({
    version: z.number().int().min(1).default(1),
    unitSystem: z.literal('METRIC').optional(),
    variables: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
    constants: z.array(FormulaConstantSchema).optional(),
    areas: z.array(
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
    ).min(1),
  }),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !session.user.isSuperAdmin &&
    (!session.user.permissions.includes(P.JOB_VIEW) || !session.user.permissions.includes(P.MATERIAL_VIEW))
  ) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const rows = await prisma.formulaLibrary.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      isActive: true,
    },
    orderBy: [{ fabricationType: 'asc' }, { name: 'asc' }],
  });

  return successResponse(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(P.SETTINGS_MANAGE)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = FormulaLibrarySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const row = await prisma.formulaLibrary.create({
    data: {
      companyId: session.user.activeCompanyId,
      createdBy: session.user.id,
      ...parsed.data,
      description: parsed.data.description ?? null,
      specificationSchema:
        parsed.data.specificationSchema == null
          ? Prisma.JsonNull
          : (parsed.data.specificationSchema as Prisma.InputJsonValue),
      formulaConfig: parsed.data.formulaConfig as Prisma.InputJsonValue,
    },
  });

  return successResponse(row, 201);
}
