import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { serializeMaterialUoms } from '@/lib/utils/materialUom';
import type { MaterialUomWithUnit } from '@/lib/utils/materialUom';
import { decimalToNumber } from '@/lib/utils/decimal';
import { ensureCategoryRef, ensureWarehouseRef } from '@/lib/materialMasterData';
import { z }                 from 'zod';

const MaterialSchema = z.object({
  name:                z.string().min(1).max(100),
  description:         z.string().max(500).optional(),
  unit:                z.string().min(1).max(20),
  category:            z.string().min(1).max(100).optional(),
  warehouse:           z.string().min(1).max(100).optional(),
  stockType:           z.string().min(1).max(50),
  allowNegativeConsumption: z.boolean().optional(),
  externalItemName:    z.string().min(1).max(100).optional(),
  unitCost:            z.number().finite().min(0).optional(),
  reorderLevel:        z.number().finite().min(0).optional(),
  currentStock:        z.number().finite().min(0).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const materials = await prisma.material.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      isActive: true,
    },
    orderBy: { name: 'asc' },
    include: {
      materialUoms: {
        include: { unit: { select: { id: true, name: true } } },
        orderBy: [{ isBase: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });

  return successResponse(
    materials.map(({ materialUoms, ...m }) => ({
      ...m,
      materialUoms: serializeMaterialUoms(materialUoms as MaterialUomWithUnit[]),
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.create')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body   = await req.json();
  const parsed = MaterialSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  // Check if material name already exists for this company
  const existing = await prisma.material.findUnique({
    where: {
      companyId_name: {
        companyId: session.user.activeCompanyId,
        name: parsed.data.name,
      },
    },
  });
  if (existing) return errorResponse('Material with this name already exists', 409);

  const companyId = session.user.activeCompanyId;

  const material = await prisma.$transaction(async (tx) => {
    const categoryRef = await ensureCategoryRef(tx, companyId, parsed.data.category);
    const warehouseRef = await ensureWarehouseRef(tx, companyId, parsed.data.warehouse);

    const mat = await tx.material.create({
      data: {
        ...parsed.data,
        allowNegativeConsumption: parsed.data.allowNegativeConsumption ?? false,
        externalItemName: parsed.data.externalItemName ?? null,
        companyId,
        category: categoryRef.categoryName,
        categoryId: categoryRef.categoryId,
        warehouse: warehouseRef.warehouseName,
        warehouseId: warehouseRef.warehouseId,
        unitCost: decimalToNumber(parsed.data.unitCost) ?? null,
        reorderLevel: decimalToNumber(parsed.data.reorderLevel) ?? null,
        currentStock: decimalToNumber(parsed.data.currentStock) ?? 0,
        isActive: true,
      },
    });

    const unitRow = await tx.unit.findUnique({
      where: {
        companyId_name: {
          companyId,
          name: parsed.data.unit.trim(),
        },
      },
    });
    if (unitRow) {
      await tx.materialUom.create({
        data: {
          companyId,
          materialId: mat.id,
          unitId: unitRow.id,
          isBase: true,
          parentUomId: null,
          factorToParent: 1,
        },
      });
    }

    return mat;
  });

  const withUoms = await prisma.material.findUnique({
    where: { id: material.id },
    include: {
      materialUoms: {
        include: { unit: { select: { id: true, name: true } } },
        orderBy: [{ isBase: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });

  return successResponse(
    {
      ...material,
      materialUoms: withUoms
        ? serializeMaterialUoms(withUoms.materialUoms as MaterialUomWithUnit[])
        : [],
    },
    201
  );
}
