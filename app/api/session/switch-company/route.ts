import { auth }            from '@/auth';
import { connectSystemDB } from '@/lib/db/system';
import { User }            from '@/lib/db/models/system/User';
import { Company }         from '@/lib/db/models/system/Company';
import { Role }            from '@/lib/db/models/system/Role';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Types }           from 'mongoose';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import type { Permission } from '@/lib/permissions';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const { companyId } = await req.json();
  await connectSystemDB();

  let activeCompanySlug:   string | null = null;
  let activeCompanyDbName: string | null = null;
  let activeCompanyName:   string | null = null;
  let permissions: Permission[]          = [];
  let allowedCompanyIds:   string[]       = [];

  // Get user and their allowed companies
  const dbUser = await User.findById(session.user.id).lean();
  if (!dbUser) return errorResponse('User not found', 404);

  allowedCompanyIds = dbUser.companyAccess.map((a: { companyId: { toString(): string } }) => a.companyId.toString());

  if (companyId) {
    // Validate user has access
    const access = dbUser.companyAccess.find(
      (a: { companyId: { toString(): string }; roleId: unknown }) =>
        a.companyId.toString() === companyId
    );
    if (!access && !dbUser.isSuperAdmin) {
      return errorResponse('Access denied to this company', 403);
    }

    const company = await Company.findById(companyId).lean();
    if (!company) return errorResponse('Company not found', 404);

    activeCompanySlug   = company.slug;
    activeCompanyDbName = company.dbName;
    activeCompanyName   = company.name;

    if (dbUser.isSuperAdmin) {
      permissions = ALL_PERMISSIONS;
    } else if (access) {
      const role = await Role.findById(access.roleId).lean();
      permissions = (role?.permissions ?? []) as Permission[];
    }

    // Persist active company on user document
    await User.findByIdAndUpdate(session.user.id, {
      activeCompanyId: new Types.ObjectId(companyId),
    });
  } else {
    // Super admin deselecting company
    await User.findByIdAndUpdate(session.user.id, { activeCompanyId: null });
  }

  return successResponse({
    activeCompanyId:     companyId ?? null,
    activeCompanySlug,
    activeCompanyDbName,
    activeCompanyName,
    permissions,
    allowedCompanyIds,
    isSuperAdmin: dbUser.isSuperAdmin,
  });
}
