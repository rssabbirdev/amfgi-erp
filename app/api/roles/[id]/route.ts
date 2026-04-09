import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
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

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const { id } = await params;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return errorResponse('Role not found', 404);

  return successResponse(role);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('role.manage')) {
    return errorResponse('Forbidden', 403);
  }
  const { id } = await params;

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) return errorResponse('Role not found', 404);

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.permissions !== undefined) update.permissions = parsed.data.permissions;

  const role = await prisma.role.update({
    where: { id },
    data: update,
  });

  return successResponse(role);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const body = await req.json().catch(() => ({ hardDelete: false }));
  const { hardDelete } = body;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return errorResponse('Role not found', 404);

  if (role.isSystem && !hardDelete) {
    return errorResponse('System roles can only be deleted with explicit confirmation', 403);
  }

  await prisma.role.delete({ where: { id } });
  return successResponse({ deleted: true, permanent: true });
}
