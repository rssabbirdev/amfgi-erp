import { auth }            from '@/auth';
import { connectSystemDB } from '@/lib/db/system';
import { Role }            from '@/lib/db/models/system/Role';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }               from 'zod';
import { ALL_PERMISSIONS } from '@/lib/permissions';

const UpdateSchema = z.object({
  name:        z.string().min(1).max(80).optional(),
  permissions: z.array(z.string()).refine(
    (arr) => arr.every((p) => (ALL_PERMISSIONS as string[]).includes(p)),
    { message: 'Invalid permission key' }
  ).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('role.manage')) {
    return errorResponse('Forbidden', 403);
  }
  const { id } = await params;

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  await connectSystemDB();
  const role = await Role.findById(id);
  if (!role) return errorResponse('Role not found', 404);

  Object.assign(role, parsed.data);
  await role.save();
  return successResponse(role);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);
  const { id } = await params;
  const { hardDelete } = await req.json().catch(() => ({ hardDelete: false }));

  await connectSystemDB();
  const role = await Role.findById(id);
  if (!role) return errorResponse('Role not found', 404);

  // For system roles, only allow deletion with explicit hardDelete confirmation
  if (role.isSystem && !hardDelete) {
    return errorResponse('System roles can only be deleted with explicit confirmation', 403);
  }

  await role.deleteOne();
  return successResponse({ deleted: true, permanent: true });
}
