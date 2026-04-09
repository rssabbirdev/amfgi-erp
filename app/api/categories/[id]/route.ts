import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CategoryUpdateSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { id } = await params;
  const body = await req.json();
  const parsed = CategoryUpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    // Fetch the category to get old name
    const category = await prisma.category.findUnique({
      where: { id },
    });
    if (!category || category.companyId !== companyId) {
      return errorResponse('Category not found', 404);
    }

    // Check for name uniqueness (ignore if same name)
    if (parsed.data.name !== category.name) {
      const existing = await prisma.category.findUnique({
        where: {
          companyId_name: {
            companyId: session.user.activeCompanyId,
            name: parsed.data.name.trim(),
          },
        },
      });
      if (existing) return errorResponse('Category with this name already exists', 409);
    }

    // Update category and cascade to materials
    const updated = await prisma.$transaction(async (tx) => {
      await tx.material.updateMany({
        where: {
          companyId,
          category: category.name,
        },
        data: {
          category: parsed.data.name.trim(),
        },
      });

      return tx.category.update({
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
    // Fetch the category to get its name
    const category = await prisma.category.findUnique({
      where: { id },
    });
    if (!category || category.companyId !== companyId) {
      return errorResponse('Category not found', 404);
    }

    // Count materials using this category
    const count = await prisma.material.count({
      where: {
        companyId,
        category: category.name,
        isActive: true,
      },
    });

    if (count > 0) {
      return errorResponse(
        `${count} material${count !== 1 ? 's' : ''} ${count === 1 ? 'uses' : 'use'} this category`,
        409
      );
    }

    // Delete the category
    await prisma.category.delete({ where: { id } });

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Delete failed', 400);
  }
}
