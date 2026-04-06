import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';
import { Types }             from 'mongoose';

const UpdateSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  unit:        z.string().min(1).max(20).optional(),
  description: z.string().max(500).optional(),
  unitCost:    z.number().min(0).optional(),
  minStock:    z.number().min(0).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const conn = await getCompanyDB(dbName);
  const { Material } = getModels(conn);
  const material = await Material.findById(id).lean();
  if (!material) return errorResponse('Material not found', 404);
  return successResponse(material);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.edit')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const conn = await getCompanyDB(dbName);
  const { Material } = getModels(conn);
  const updated = await Material.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
  if (!updated) return errorResponse('Material not found', 404);
  return successResponse(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.delete')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const { hardDelete } = await req.json().catch(() => ({ hardDelete: false }));

  const conn = await getCompanyDB(dbName);
  const { Material, Transaction } = getModels(conn);

  // Check for linked transactions
  const txnCount = await Transaction.countDocuments({ materialId: new Types.ObjectId(id) });
  if (txnCount > 0 && !hardDelete) {
    return errorResponse(
      `Cannot delete: ${txnCount} transaction(s) linked to this material. Deactivate instead or use hard delete if you're certain.`,
      400
    );
  }

  if (hardDelete) {
    // Permanently delete (only if no transactions OR user explicitly confirmed)
    await Material.findByIdAndDelete(id);
    return successResponse({ deleted: true, permanent: true });
  } else {
    // Soft delete (deactivate)
    const material = await Material.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean();
    if (!material) return errorResponse('Material not found', 404);
    return successResponse({ deleted: true, permanent: false, message: 'Material deactivated' });
  }
}
