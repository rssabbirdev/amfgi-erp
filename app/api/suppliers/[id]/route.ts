import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const UpdateSupplierSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  contactPerson: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const { id } = await params;
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        companyId: session.user.activeCompanyId,
      },
    });
    if (!supplier) return errorResponse('Supplier not found', 404);

    return successResponse(supplier);
  } catch (err) {
    return errorResponse('Failed to fetch supplier', 500);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateSupplierSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.contactPerson !== undefined) updateData.contactPerson = parsed.data.contactPerson;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email || null;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
    if (parsed.data.address !== undefined) updateData.address = parsed.data.address;
    if (parsed.data.city !== undefined) updateData.city = parsed.data.city;
    if (parsed.data.country !== undefined) updateData.country = parsed.data.country;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

    const supplier = await prisma.supplier.update({
      where: { id },
      data: updateData,
    });
    if (!supplier) return errorResponse('Supplier not found', 404);

    return successResponse(supplier);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update supplier';
    if (errorMsg.includes('not found')) {
      return errorResponse('Supplier not found', 404);
    }
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Supplier name already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const { id } = await params;
    const supplier = await prisma.supplier.delete({
      where: { id },
    });
    if (!supplier) return errorResponse('Supplier not found', 404);

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete supplier';
    if (errorMsg.includes('not found')) {
      return errorResponse('Supplier not found', 404);
    }
    return errorResponse(errorMsg, 500);
  }
}
