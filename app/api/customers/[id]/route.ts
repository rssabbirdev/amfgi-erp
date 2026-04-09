import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const UpdateSchema = z.object({
  name:          z.string().min(1).max(100).optional(),
  contactPerson: z.string().max(100).optional(),
  phone:         z.string().max(30).optional(),
  email:         z.string().email().optional().or(z.literal('')),
  address:       z.string().max(300).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: {
      id,
      companyId: session.user.activeCompanyId,
    },
  });
  if (!customer) return errorResponse('Customer not found', 404);
  return successResponse(customer);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.edit')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.contactPerson !== undefined) updateData.contactPerson = parsed.data.contactPerson;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email || null;
    if (parsed.data.address !== undefined) updateData.address = parsed.data.address;

    const updated = await prisma.customer.update({
      where: { id },
      data: updateData,
    });
    return successResponse(updated);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to update customer';
    if (errorMsg.includes('not found')) {
      return errorResponse('Customer not found', 404);
    }
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Customer name already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.delete')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const { hardDelete } = await req.json().catch(() => ({ hardDelete: false }));

  try {
    // Check for linked jobs
    const jobCount = await prisma.job.count({
      where: {
        customerId: id,
        companyId: session.user.activeCompanyId,
      },
    });

    if (jobCount > 0 && !hardDelete) {
      return errorResponse(
        `Cannot delete: ${jobCount} job(s) linked to this customer. Deactivate instead or use hard delete if you're certain.`,
        400
      );
    }

    if (hardDelete) {
      // Permanently delete (only if no jobs OR user explicitly confirmed)
      await prisma.customer.delete({
        where: { id },
      });
      return successResponse({ deleted: true, permanent: true });
    } else {
      // Soft delete (deactivate)
      const customer = await prisma.customer.update({
        where: { id },
        data: { isActive: false },
      });
      return successResponse({ deleted: true, permanent: false, message: 'Customer deactivated' });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete customer';
    if (errorMsg.includes('not found')) {
      return errorResponse('Customer not found', 404);
    }
    return errorResponse(errorMsg, 500);
  }
}
