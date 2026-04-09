import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const UnitUpdateSchema = z.object({
  name: z.string().min(1).max(50),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { id } = await params;
  const body = await req.json();
  const parsed = UnitUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    // Fetch the unit to get old name
    const unit = await prisma.unit.findUnique({
      where: { id },
    });
    if (!unit || unit.companyId !== companyId) {
      return errorResponse('Unit not found', 404);
    }

    // Check for name uniqueness (ignore if same name)
    if (parsed.data.name !== unit.name) {
      const existing = await prisma.unit.findUnique({
        where: {
          companyId_name: {
            companyId,
            name: parsed.data.name.trim(),
          },
        },
      });
      if (existing) return errorResponse('Unit with this name already exists', 409);
    }

    // Update unit and cascade to materials
    const updated = await prisma.$transaction(async (tx) => {
      await tx.material.updateMany({
        where: {
          companyId,
          unit: unit.name,
        },
        data: {
          unit: parsed.data.name.trim(),
        },
      });

      return tx.unit.update({
        where: { id },
        data: { name: parsed.data.name.trim() },
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
    // Fetch the unit to get its name
    const unit = await prisma.unit.findUnique({
      where: { id },
    });
    if (!unit || unit.companyId !== companyId) {
      return errorResponse('Unit not found', 404);
    }

    // Count materials using this unit
    const count = await prisma.material.count({
      where: {
        companyId,
        unit: unit.name,
        isActive: true,
      },
    });

    if (count > 0) {
      return errorResponse(
        `${count} material${count !== 1 ? 's' : ''} ${count === 1 ? 'uses' : 'use'} this unit`,
        409
      );
    }

    // Delete the unit
    await prisma.unit.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Delete failed', 400);
  }
}
