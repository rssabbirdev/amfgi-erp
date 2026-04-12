import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { applyPartialPartyFieldsToUpdate, partyListPartyFieldsSchema } from '@/lib/partyListRecordPayload';
import { z } from 'zod';

const UpdateSupplierSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    contactPerson: z.string().max(100).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    phone: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .merge(partyListPartyFieldsSchema.partial());

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
    const existing = await prisma.supplier.findFirst({
      where: { id, companyId: session.user.activeCompanyId },
    });
    if (!existing) return errorResponse('Supplier not found', 404);

    const body = (await req.json()) as Record<string, unknown>;
    const parsed = UpdateSupplierSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
    }

    const updateData: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.name !== undefined) updateData.name = d.name;
    if (d.contactPerson !== undefined) updateData.contactPerson = d.contactPerson?.trim() || null;
    if (d.email !== undefined) updateData.email = d.email?.trim() ? d.email.trim() : null;
    if (d.phone !== undefined) updateData.phone = d.phone?.trim() || null;
    if (d.address !== undefined) updateData.address = d.address?.trim() || null;
    if (d.city !== undefined) updateData.city = d.city?.trim() || null;
    if (d.country !== undefined) updateData.country = d.country?.trim() || null;
    if (d.isActive !== undefined) updateData.isActive = d.isActive;
    applyPartialPartyFieldsToUpdate(d, body, updateData);

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
    const companyId = session.user.activeCompanyId;

    const supplier = await prisma.supplier.findFirst({
      where: { id, companyId },
    });
    if (!supplier) return errorResponse('Supplier not found', 404);

    if (supplier.source === 'PARTY_API_SYNC') {
      return errorResponse(
        'Suppliers synced from the party lists API cannot be removed from here. Deactivate the record instead.',
        403
      );
    }

    const batchCount = await prisma.stockBatch.count({
      where: {
        companyId,
        OR: [{ supplierId: id }, { supplier: supplier.name }],
      },
    });

    if (batchCount > 0) {
      await prisma.supplier.update({
        where: { id },
        data: { isActive: false },
      });
      return successResponse({
        deleted: true,
        permanent: false,
        message: `Supplier is referenced on ${batchCount} stock batch(es); marked inactive instead of deleting.`,
      });
    }

    await prisma.supplier.delete({ where: { id } });
    return successResponse({ deleted: true, permanent: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete supplier';
    if (errorMsg.includes('not found')) {
      return errorResponse('Supplier not found', 404);
    }
    return errorResponse(errorMsg, 500);
  }
}
