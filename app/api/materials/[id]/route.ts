import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { serializeMaterialUoms } from '@/lib/utils/materialUom';
import type { MaterialUomWithUnit } from '@/lib/utils/materialUom';
import { z }                 from 'zod';

const UpdateSchema = z.object({
  name:                z.string().min(1).max(100).optional(),
  description:         z.string().max(500).optional(),
  unit:                z.string().min(1).max(20).optional(),
  category:            z.string().min(1).max(100).optional(),
  warehouse:           z.string().min(1).max(100).optional(),
  stockType:           z.string().min(1).max(50).optional(),
  allowNegativeConsumption: z.boolean().optional(),
  externalItemName:    z.string().min(1).max(100).optional(),
  unitCost:            z.number().min(0).optional(),
  reorderLevel:        z.number().min(0).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const material = await prisma.material.findUnique({
    where: { id },
    include: {
      materialUoms: {
        include: { unit: { select: { id: true, name: true } } },
        orderBy: [{ isBase: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!material || material.companyId !== session.user.activeCompanyId) {
    return errorResponse('Material not found', 404);
  }

  const { materialUoms, ...rest } = material;
  return successResponse({
    ...rest,
    materialUoms: serializeMaterialUoms(materialUoms as MaterialUomWithUnit[]),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.edit')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  // Verify material belongs to this company
  const existing = await prisma.material.findUnique({ where: { id } });
  if (!existing || existing.companyId !== session.user.activeCompanyId) {
    return errorResponse('Material not found', 404);
  }

  // If renaming, check uniqueness in this company
  if (parsed.data.name && parsed.data.name !== existing.name) {
    const duplicate = await prisma.material.findUnique({
      where: {
        companyId_name: {
          companyId: session.user.activeCompanyId,
          name: parsed.data.name,
        },
      },
    });
    if (duplicate) return errorResponse('Material with this name already exists', 409);
  }

  const companyId = session.user.activeCompanyId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.material.update({
        where: { id },
        data: parsed.data,
      });

      if (parsed.data.unit !== undefined) {
        const name = parsed.data.unit.trim();
        const unitRow = await tx.unit.findUnique({
          where: { companyId_name: { companyId, name } },
        });
        if (unitRow) {
          const base = await tx.materialUom.findFirst({
            where: { materialId: id, isBase: true },
          });
          if (base) {
            const taken = await tx.materialUom.findFirst({
              where: { materialId: id, unitId: unitRow.id, NOT: { id: base.id } },
            });
            if (taken) {
              throw new Error(
                'That unit is already used as a packaging UOM for this material. Remove or change the derived UOM first.'
              );
            }
            await tx.materialUom.update({
              where: { id: base.id },
              data: { unitId: unitRow.id },
            });
          } else {
            await tx.materialUom.create({
              data: {
                companyId,
                materialId: id,
                unitId: unitRow.id,
                isBase: true,
                parentUomId: null,
                factorToParent: 1,
              },
            });
          }
        }
      }
    });
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : 'Update failed', 400);
  }

  const out = await prisma.material.findUnique({
    where: { id },
    include: {
      materialUoms: {
        include: { unit: { select: { id: true, name: true } } },
        orderBy: [{ isBase: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });
  if (!out) return errorResponse('Material not found', 404);
  const { materialUoms, ...rest } = out;
  return successResponse({
    ...rest,
    materialUoms: serializeMaterialUoms(materialUoms as MaterialUomWithUnit[]),
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.delete')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const { hardDelete } = await req.json().catch(() => ({ hardDelete: false }));

  // Verify material belongs to this company
  const material = await prisma.material.findUnique({ where: { id } });
  if (!material || material.companyId !== session.user.activeCompanyId) {
    return errorResponse('Material not found', 404);
  }

  // Check for linked transactions
  const txnCount = await prisma.transaction.count({
    where: {
      materialId: id,
      companyId: session.user.activeCompanyId,
    },
  });

  if (txnCount > 0 && !hardDelete) {
    return errorResponse(
      `Cannot delete: ${txnCount} transaction(s) linked to this material. Deactivate instead or use hard delete if you're certain.`,
      400
    );
  }

  if (hardDelete) {
    // Permanently delete (only if no transactions OR user explicitly confirmed)
    await prisma.material.delete({ where: { id } });
    return successResponse({ deleted: true, permanent: true });
  } else {
    // Soft delete (deactivate)
    await prisma.material.update({
      where: { id },
      data: { isActive: false },
    });
    return successResponse({ deleted: true, permanent: false, message: 'Material deactivated' });
  }
}
