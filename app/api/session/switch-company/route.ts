import { auth }   from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import type { Permission } from '@/lib/permissions';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const { companyId } = await req.json();

  let activeCompanySlug:   string | null = null;
  let activeCompanyName:   string | null = null;
  let permissions: Permission[]          = [];
  let allowedCompanyIds:   string[]       = [];

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { companyAccess: true },
  });

  if (!user) return errorResponse('User not found', 404);

  allowedCompanyIds = user.companyAccess.map((a) => a.companyId);

  if (companyId) {
    const access = user.companyAccess.find((a) => a.companyId === companyId);
    if (!access && !user.isSuperAdmin) {
      return errorResponse('Access denied to this company', 403);
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return errorResponse('Company not found', 404);

    activeCompanySlug = company.slug;
    activeCompanyName = company.name;

    if (user.isSuperAdmin) {
      permissions = ALL_PERMISSIONS;
    } else if (access) {
      const role = await prisma.role.findUnique({ where: { id: access.roleId } });
      permissions = (role?.permissions ?? []) as Permission[];
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { activeCompanyId: companyId },
    });
  } else {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { activeCompanyId: null },
    });
  }

  return successResponse({
    activeCompanyId:     companyId ?? null,
    activeCompanySlug,
    activeCompanyName,
    permissions,
    allowedCompanyIds,
    isSuperAdmin: user.isSuperAdmin,
  });
}
