import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { applyPartialPartyFieldsToUpdate, partyListPartyFieldsSchema } from '@/lib/partyListRecordPayload';
import { serializeCustomerWithContacts, syncCustomerContacts } from '@/lib/partyContacts';
import { z } from 'zod';

const UpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    contactPerson: z.string().max(100).optional(),
    phone: z.string().max(30).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    address: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .merge(partyListPartyFieldsSchema.partial());

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: {
      id,
      companyId,
    },
    include: {
      contacts: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!customer) return errorResponse('Customer not found', 404);
  return successResponse(serializeCustomerWithContacts(customer));
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.edit')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const updateData: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.name !== undefined) updateData.name = d.name;
    if (d.contactPerson !== undefined) updateData.contactPerson = d.contactPerson?.trim() || null;
    if (d.phone !== undefined) updateData.phone = d.phone?.trim() || null;
    if (d.email !== undefined) updateData.email = d.email?.trim() ? d.email.trim() : null;
    if (d.address !== undefined) updateData.address = d.address?.trim() || null;
    if (d.isActive !== undefined) updateData.isActive = d.isActive;
    applyPartialPartyFieldsToUpdate(d, body, updateData);

    const existing = await prisma.customer.findFirst({
      where: { id, companyId },
    });
    if (!existing) return errorResponse('Customer not found', 404);

    const updated = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id },
        data: updateData,
      });
      if (Object.prototype.hasOwnProperty.call(body, 'contacts')) {
        await syncCustomerContacts(tx, {
          companyId,
          customerId: customer.id,
          contacts: d.contacts,
        });
      }
      return tx.customer.findUniqueOrThrow({
        where: { id: customer.id },
        include: {
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
    return successResponse(serializeCustomerWithContacts(updated));
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

  try {
    const customer = await prisma.customer.findFirst({
      where: { id, companyId: session.user.activeCompanyId },
    });
    if (!customer) return errorResponse('Customer not found', 404);

    if (customer.source === 'PARTY_API_SYNC') {
      return errorResponse(
        'Customers synced from the party lists API cannot be removed from here. Deactivate the record instead.',
        403
      );
    }

    const jobCount = await prisma.job.count({
      where: {
        customerId: id,
        companyId: session.user.activeCompanyId,
      },
    });

    if (jobCount > 0) {
      await prisma.customer.update({
        where: { id },
        data: { isActive: false },
      });
      return successResponse({
        deleted: true,
        permanent: false,
        message: `Customer has ${jobCount} job(s); marked inactive instead of deleting.`,
      });
    }

    await prisma.customer.delete({ where: { id } });
    return successResponse({ deleted: true, permanent: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to delete customer';
    if (errorMsg.includes('not found')) {
      return errorResponse('Customer not found', 404);
    }
    return errorResponse(errorMsg, 500);
  }
}
