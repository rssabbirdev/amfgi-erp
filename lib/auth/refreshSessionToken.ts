import type { Prisma } from '@prisma/client';
import type { Permission } from '@/lib/permissions';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { resolvePermissionsForCompany, uniqueCompanyIdsFromAccess } from '@/lib/auth/resolvePermissions';

type DbClient = Pick<Prisma.TransactionClient, 'user' | 'company' | 'userCompanyAccess'>;

export type AuthJwtToken = {
  sub?: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
  activeCompanyId?: string | null;
  activeCompanySlug?: string | null;
  activeCompanyName?: string | null;
  permissions?: Permission[];
  allowedCompanyIds?: string[];
  linkedEmployeeId?: string | null;
};

/** Re-resolve role permissions and company access from the database into the JWT. */
export async function refreshAuthJwtTokenFromDb(
  db: DbClient,
  token: AuthJwtToken,
): Promise<AuthJwtToken> {
  if (!token.sub) return token;

  const user = await db.user.findUnique({
    where: { id: token.sub },
    select: {
      isSuperAdmin: true,
      isActive: true,
      activeCompanyId: true,
      linkedEmployeeId: true,
      companyAccess: { select: { companyId: true } },
    },
  });

  if (!user || !user.isActive) {
    token.isActive = false;
    token.isSuperAdmin = false;
    token.permissions = [];
    token.allowedCompanyIds = [];
    return token;
  }

  token.isActive = true;
  token.isSuperAdmin = user.isSuperAdmin;
  token.linkedEmployeeId = user.linkedEmployeeId ?? null;

  const allowedCompanyIds = uniqueCompanyIdsFromAccess(user.companyAccess);
  token.allowedCompanyIds = allowedCompanyIds;

  let companyId =
    (token.activeCompanyId as string | null | undefined) ?? user.activeCompanyId ?? null;

  if (!user.isSuperAdmin && companyId && !allowedCompanyIds.includes(companyId)) {
    companyId = allowedCompanyIds[0] ?? null;
    token.activeCompanyId = companyId;
  }

  if (user.isSuperAdmin) {
    token.permissions = ALL_PERMISSIONS;
  } else {
    token.permissions = await resolvePermissionsForCompany(db, token.sub, companyId);
  }

  if (companyId) {
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { slug: true, name: true },
    });
    if (company) {
      token.activeCompanySlug = company.slug;
      token.activeCompanyName = company.name;
    }
  } else {
    token.activeCompanySlug = null;
    token.activeCompanyName = null;
  }

  return token;
}
