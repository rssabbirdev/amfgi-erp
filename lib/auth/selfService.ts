import type { PrismaClient } from '@prisma/client';

type SelfServiceCandidate = {
  isSuperAdmin?: boolean | null;
  permissions?: string[] | null;
  linkedEmployeeId?: string | null;
};

/** Default landing route for linked employee portal logins. */
export const EMPLOYEE_PORTAL_HOME = '/me';

/** Row / session shape: linked employee login, not a super admin. */
export function isEmployeeSelfServiceAccount(
  user: { isSuperAdmin?: boolean | null; linkedEmployeeId?: string | null } | null | undefined,
) {
  if (!user) return false;
  if (user.isSuperAdmin) return false;
  return Boolean(user.linkedEmployeeId);
}

export function isEmployeeSelfServiceUser(user: SelfServiceCandidate | null | undefined) {
  if (!user) return false;
  return isEmployeeSelfServiceAccount(user);
}

/** Paths that should redirect to the employee portal after login. */
export function isSelfServiceLandingPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/dashboard' ||
    pathname === '/profile' ||
    pathname.startsWith('/select-company')
  );
}

export function resolveEmployeePortalPath(
  callbackUrl: string,
  user: { isSuperAdmin?: boolean | null; linkedEmployeeId?: string | null } | null | undefined,
): string {
  if (!isEmployeeSelfServiceUser(user)) return callbackUrl;
  if (isSelfServiceLandingPath(callbackUrl)) return EMPLOYEE_PORTAL_HOME;
  if (!callbackUrl.startsWith('/me')) return EMPLOYEE_PORTAL_HOME;
  return callbackUrl;
}

/** Portal users inherit active company from their linked employee when unset. */
export async function ensureActiveCompanyForLinkedEmployee(
  prisma: Pick<PrismaClient, 'employee' | 'user'>,
  userId: string,
  activeCompanyId: string | null,
  linkedEmployeeId: string | null,
): Promise<string | null> {
  if (activeCompanyId || !linkedEmployeeId) return activeCompanyId;
  const employee = await prisma.employee.findUnique({
    where: { id: linkedEmployeeId },
    select: { companyId: true },
  });
  if (!employee?.companyId) return null;
  await prisma.user.update({
    where: { id: userId },
    data: { activeCompanyId: employee.companyId },
  });
  return employee.companyId;
}
