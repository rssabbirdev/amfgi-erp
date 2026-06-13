import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { serializeMaterialUoms } from '@/lib/utils/materialUom';
import type { MaterialUomWithUnit } from '@/lib/utils/materialUom';
import { decimalToNumber, decimalToNumberOrZero } from '@/lib/utils/decimal';
import { resolveCategoryRef, resolveWarehouseRef } from '@/lib/materialMasterData';
import {
  countMaterialBlockingLinks,
  permanentlyDeleteMaterial,
} from '@/lib/materials/permanentlyDeleteMaterial';
import { applyMaterialWarehouseDelta } from '@/lib/warehouses/stockWarehouses';
import { canViewFormulaMaterialsApi } from '@/lib/permissions/stockModuleAccess';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { sortMaterialsBySearchRelevance } from '@/lib/pagination/materialSearchRelevance';
import { buildMaterialListOrderBy } from '@/lib/pagination/materialListSort';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const materialListInclude = {
  materialUoms: {
    include: { unit: { select: { id: true, name: true } } },
    orderBy: [{ isBase: 'desc' as const }, { createdAt: 'asc' as const }],
  },
  materialWarehouseStocks: {
    select: {
      warehouseId: true,
      currentStock: true,
    },
  },
} satisfies Prisma.MaterialInclude;

function serializeMaterialListRow({
  materialUoms,
  materialWarehouseStocks,
  ...m
}: Prisma.MaterialGetPayload<{ include: typeof materialListInclude }>) {
  return {
    ...m,
    materialUoms: serializeMaterialUoms(materialUoms as MaterialUomWithUnit[]),
    materialWarehouseStocks,
  };
}

function buildMaterialListWhere(companyId: string, search: string): Prisma.MaterialWhereInput {
  const where: Prisma.MaterialWhereInput = {
    companyId,
    isActive: true,
  };

  if (!search) return where;

  return {
    ...where,
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
      { externalItemName: { contains: search, mode: 'insensitive' } },
    ],
  };
}

const MaterialSchema = z.object({
  name:                z.string().min(1).max(100),
  description:         z.string().max(500).optional(),
  unit:                z.string().min(1).max(20),
  category:            z.string().min(1).max(100).optional(),
  categoryId:          z.string().min(1).max(100).optional(),
  warehouse:           z.string().min(1).max(100).optional(),
  warehouseId:         z.string().min(1).max(100).optional(),
  stockType:           z.string().min(1).max(50),
  allowNegativeConsumption: z.boolean().optional(),
  externalItemName:    z.string().min(1).max(100).optional(),
  unitCost:            z.number().finite().min(0).optional(),
  reorderLevel:        z.number().finite().min(0).optional(),
  currentStock:        z.number().finite().min(0).optional(),
  assemblyOutputQuantity: z.number().finite().positive().optional(),
  assemblyOverheadPercent: z.number().finite().min(0).optional(),
  assemblyUseDynamicCost: z.boolean().optional(),
  imageUrl: z.string().url().optional(),
  attachmentUrl: z.string().url().optional(),
  attachmentName: z.string().min(1).max(255).optional(),
  attachmentMimeType: z.string().min(1).max(150).optional(),
  photoGallery: z
    .array(
      z.object({
        url: z.string().url(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(150),
      })
    )
    .optional(),
  documentFiles: z
    .array(
      z.object({
        url: z.string().url(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(150),
      })
    )
    .optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canViewFormulaMaterialsApi(session.user.permissions, session.user.isSuperAdmin)) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');

  try {
    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));
      const search = searchParams.get('search')?.trim() ?? '';
      const sortBy = searchParams.get('sortBy');
      const sortDir = searchParams.get('sortDir');
      const where = buildMaterialListWhere(companyId, search);
      const orderBy = buildMaterialListOrderBy(sortBy, sortDir);

      const [total, materials] = await Promise.all([
        prisma.material.count({ where }),
        prisma.material.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
          include: materialListInclude,
        }),
      ]);

      const rows = materials.map(serializeMaterialListRow);
      return successResponse({
        items: search ? sortMaterialsBySearchRelevance(rows, search) : rows,
        total,
      });
    }

    const materials = await prisma.material.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
      include: materialListInclude,
    });

    return successResponse(materials.map(serializeMaterialListRow));
  } catch {
    return errorResponse('Failed to fetch materials', 500);
  }
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

  // Check if an active material with this name already exists for this company.
  const existing = await prisma.material.findUnique({
    where: {
      companyId_name: {
        companyId: session.user.activeCompanyId,
        name: parsed.data.name,
      },
    },
  });
  if (existing?.isActive) {
    return errorResponse('Material with this name already exists', 409);
  }

  const companyId = session.user.activeCompanyId;

  if (existing && !existing.isActive) {
    const blockingLinks = await countMaterialBlockingLinks(prisma, {
      companyId,
      materialId: existing.id,
    });
    if (blockingLinks > 0) {
      return errorResponse(
        'An inactive material with this name still has stock history. Reactivate it or choose a different name.',
        409
      );
    }
  }

  const material = await prisma.$transaction(async (tx) => {
    if (existing && !existing.isActive) {
      await permanentlyDeleteMaterial(tx, { companyId, materialId: existing.id });
    }
    const categoryRef = await resolveCategoryRef(tx, companyId, {
      id: parsed.data.categoryId,
      name: parsed.data.category,
    });
    const warehouseRef = await resolveWarehouseRef(tx, companyId, {
      id: parsed.data.warehouseId,
      name: parsed.data.warehouse,
    });

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
        assemblyOutputQuantity: decimalToNumber(parsed.data.assemblyOutputQuantity) ?? 1,
        assemblyOverheadPercent: decimalToNumber(parsed.data.assemblyOverheadPercent) ?? 0,
        assemblyUseDynamicCost: parsed.data.assemblyUseDynamicCost ?? true,
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

    const openingStock = decimalToNumberOrZero(parsed.data.currentStock);
    if (openingStock > 0 && warehouseRef.warehouseId) {
      await applyMaterialWarehouseDelta(
        tx,
        companyId,
        mat.id,
        warehouseRef.warehouseId,
        openingStock
      );

      const unitCost = decimalToNumberOrZero(parsed.data.unitCost);
      await tx.stockBatch.create({
        data: {
          materialId: mat.id,
          companyId,
          warehouseId: warehouseRef.warehouseId,
          batchNumber: `OPEN-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          quantityReceived: openingStock,
          quantityAvailable: openingStock,
          unitCost,
          totalCost: openingStock * unitCost,
          supplier: 'Opening balance',
          receiptNumber: null,
          receivedDate: new Date(),
          expiryDate: null,
          notes: 'Created on material setup',
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
      materialWarehouseStocks: {
        select: {
          warehouseId: true,
          currentStock: true,
        },
      },
    },
  });

  publishLiveUpdate({
    companyId,
    channel: 'stock',
    entity: 'material',
    action: 'created',
  });

  return successResponse(
    {
      ...material,
      materialUoms: withUoms
        ? serializeMaterialUoms(withUoms.materialUoms as MaterialUomWithUnit[])
        : [],
      materialWarehouseStocks: withUoms?.materialWarehouseStocks ?? [],
    },
    201
  );
}
