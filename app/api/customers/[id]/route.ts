import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';
import { Types }             from 'mongoose';

const UpdateSchema = z.object({
  name:    z.string().min(1).max(100).optional(),
  phone:   z.string().max(30).optional(),
  email:   z.string().email().optional().or(z.literal('')),
  address: z.string().max(300).optional(),
  notes:   z.string().max(500).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.edit')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const conn = await getCompanyDB(dbName);
  const { Customer } = getModels(conn);
  const updated = await Customer.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
  if (!updated) return errorResponse('Customer not found', 404);
  return successResponse(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.delete')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const { hardDelete } = await req.json().catch(() => ({ hardDelete: false }));

  const conn = await getCompanyDB(dbName);
  const { Customer, Job } = getModels(conn);

  // Check for linked jobs
  const jobCount = await Job.countDocuments({ customerId: new Types.ObjectId(id) });
  if (jobCount > 0 && !hardDelete) {
    return errorResponse(
      `Cannot delete: ${jobCount} job(s) linked to this customer. Deactivate instead or use hard delete if you're certain.`,
      400
    );
  }

  if (hardDelete) {
    // Permanently delete (only if no jobs OR user explicitly confirmed)
    await Customer.findByIdAndDelete(id);
    return successResponse({ deleted: true, permanent: true });
  } else {
    // Soft delete (deactivate)
    const customer = await Customer.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean();
    if (!customer) return errorResponse('Customer not found', 404);
    return successResponse({ deleted: true, permanent: false, message: 'Customer deactivated' });
  }
}
