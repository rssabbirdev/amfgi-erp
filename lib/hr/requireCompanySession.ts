import { auth } from '@/auth';
import type { Permission } from '@/lib/permissions';
import { errorResponse } from '@/lib/utils/apiResponse';
import type { Session } from 'next-auth';

export type AppSession = Session;
export type AppSessionUser = Session['user'];

export async function requireCompanySession() {
  const session = (await auth()) as Session | null;
  if (!session?.user) return { ok: false as const, response: errorResponse('Unauthorized', 401) };
  const companyId = session.user.activeCompanyId;
  if (!companyId) return { ok: false as const, response: errorResponse('No active company selected', 400) };
  return { ok: true as const, session, companyId };
}

export function hasPerm(
  user: AppSessionUser,
  perm: Permission
): boolean {
  if (user.isSuperAdmin) return true;
  return user.permissions.includes(perm);
}

export function requirePerm(
  user: AppSessionUser,
  perm: Permission
): boolean {
  return hasPerm(user, perm);
}
