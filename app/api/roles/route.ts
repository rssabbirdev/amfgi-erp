import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }               from 'zod';
import { ALL_PERMISSIONS } from '@/lib/permissions';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const roles = await prisma.role.findMany({
    orderBy: [
      { isSystem: 'desc' },
      { name: 'asc' },
    ],
  });

  return successResponse(roles);
}

const RoleSchema = z.object({
  name:        z.string().min(1).max(80),
  permissions: z.array(z.string()).refine(
    (arr) => arr.every((p) => (ALL_PERMISSIONS as string[]).includes(p)),
    { message: 'Invalid permission key' }
  ),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('role.manage')) {
    return errorResponse('Forbidden', 403);
  }

  const body   = await req.json();
  const parsed = RoleSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const slug = parsed.data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const role = await prisma.role.create({
    data: {
      name:        parsed.data.name,
      slug,
      permissions: parsed.data.permissions,
      isSystem:    false,
    },
  });

  return successResponse(role, 201);
}
