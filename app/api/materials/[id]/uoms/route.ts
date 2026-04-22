import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { serializeMaterialUoms, assertAcyclicNewParent } from '@/lib/utils/materialUom';
import type { MaterialUomWithUnit } from '@/lib/utils/materialUom';
import { z } from 'zod';

const CreateBaseSchema = z.object({
  mode: z.literal('base'),
  unitId: z.string().min(1),
});

const CreateDerivedSchema = z.object({
  mode: z.literal('derived'),
  unitId: z.string().min(1),
  parentUomId: z.string().min(1),
  factorToParent: z.number().positive(),
});

const CreateUomSchema = z.discriminatedUnion('mode', [CreateBaseSchema, CreateDerivedSchema]);

function canView(user: AppSessionUser) {
  return user.isSuperAdmin || user.permissions.includes('material.view');
}

function canEdit(user: AppSessionUser) {
  return user.isSuperAdmin || user.permissions.includes('material.edit');
}

async function getSerializedMaterialUoms(materialId: string) {
  const rows = await prisma.materialUom.findMany({
    where: { materialId },
    include: { unit: { select: { id: true, name: true } } },
    orderBy: [{ isBase: 'desc' }, { createdAt: 'asc' }],
  });

  return serializeMaterialUoms(rows as MaterialUomWithUnit[]);
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canView(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id: materialId } = await params;
  const mat = await prisma.material.findFirst({
    where: { id: materialId, companyId: session.user.activeCompanyId },
    select: { id: true },
  });
  if (!mat) return errorResponse('Material not found', 404);

  return successResponse(await getSerializedMaterialUoms(materialId));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canEdit(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id: materialId } = await params;
  const mat = await prisma.material.findFirst({
    where: { id: materialId, companyId: session.user.activeCompanyId },
  });
  if (!mat) return errorResponse('Material not found', 404);

  const body = await req.json().catch(() => null);
  const parsed = CreateUomSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const existing = await prisma.materialUom.findMany({ where: { materialId } });

  if (parsed.data.mode === 'base') {
    if (existing.some((e) => e.isBase)) {
      return errorResponse('This material already has a base unit. Add derived units (e.g. drum, pallet) instead.', 409);
    }
    const unit = await prisma.unit.findFirst({
      where: { id: parsed.data.unitId, companyId: mat.companyId, isActive: true },
    });
    if (!unit) return errorResponse('Unit not found for this company', 422);

    const dup = existing.some((e) => e.unitId === unit.id);
    if (dup) return errorResponse('This unit is already linked to the material', 409);

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.materialUom.create({
        data: {
          companyId: mat.companyId,
          materialId,
          unitId: unit.id,
          isBase: true,
          parentUomId: null,
          factorToParent: 1,
        },
        include: { unit: { select: { id: true, name: true } } },
      });
      await tx.material.update({
        where: { id: materialId },
        data: { unit: unit.name },
      });
      return row;
    });

    const serialized = await getSerializedMaterialUoms(materialId);
    return successResponse(serialized.find((row) => row.id === created.id) ?? null, 201);
  }

  // derived
  if (!existing.some((e) => e.isBase)) {
    return errorResponse('Define the base unit first (stock is kept in base units, e.g. kg).', 422);
  }

  const derivedData = parsed.data as z.infer<typeof CreateDerivedSchema>;

  const parent = existing.find((e) => e.id === derivedData.parentUomId);
  if (!parent || parent.materialId !== materialId) {
    return errorResponse('Parent UOM not found for this material', 422);
  }

  const unit = await prisma.unit.findFirst({
    where: { id: derivedData.unitId, companyId: mat.companyId, isActive: true },
  });
  if (!unit) return errorResponse('Unit not found for this company', 422);

  if (existing.some((e) => e.unitId === unit.id)) {
    return errorResponse('This unit is already linked to the material', 409);
  }

  assertAcyclicNewParent(
    existing.map((e) => ({ id: e.id, parentUomId: e.parentUomId })),
    derivedData.parentUomId
  );

  const created = await prisma.materialUom.create({
    data: {
      companyId: mat.companyId,
      materialId,
      unitId: unit.id,
      isBase: false,
      parentUomId: derivedData.parentUomId,
      factorToParent: derivedData.factorToParent,
    },
    include: { unit: { select: { id: true, name: true } } },
  });

  const serialized = await getSerializedMaterialUoms(materialId);
  return successResponse(serialized.find((row) => row.id === created.id) ?? null, 201);
}
