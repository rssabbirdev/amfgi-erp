import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const WarehouseUpdateSchema = z.object({
  name: z.string().min(1).max(100),
  location: z.string().max(200).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { id } = await params;
  const body = await req.json();
  const parsed = WarehouseUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    // Fetch the warehouse to get old name
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
    });
    if (!warehouse || warehouse.companyId !== companyId) {
      return errorResponse('Warehouse not found', 404);
    }

    // Check for name uniqueness (ignore if same name)
    if (parsed.data.name !== warehouse.name) {
      const existing = await prisma.warehouse.findUnique({
        where: {
          companyId_name: {
            companyId,
            name: parsed.data.name.trim(),
          },
        },
      });
      if (existing) return errorResponse('Warehouse with this name already exists', 409);
    }

    // Update warehouse and cascade to materials
    const updated = await prisma.$transaction(async (tx) => {
      await tx.material.updateMany({
        where: {
          companyId,
          warehouse: warehouse.name,
        },
        data: {
          warehouse: parsed.data.name.trim(),
        },
      });

      return tx.warehouse.update({
        where: { id },
        data: {
          name: parsed.data.name.trim(),
          location: parsed.data.location?.trim() || null,
        },
      });
    });

    return successResponse(updated);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Update failed', 400);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { id } = await params;

  try {
    // Fetch the warehouse to get its name
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
    });
    if (!warehouse || warehouse.companyId !== companyId) {
      return errorResponse('Warehouse not found', 404);
    }

    // Count materials using this warehouse
    const count = await prisma.material.count({
      where: {
        companyId,
        warehouse: warehouse.name,
        isActive: true,
      },
    });

    if (count > 0) {
      return errorResponse(
        `${count} material${count !== 1 ? 's' : ''} ${count === 1 ? 'uses' : 'use'} this warehouse`,
        409
      );
    }

    // Delete the warehouse
    await prisma.warehouse.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Delete failed', 400);
  }
}
