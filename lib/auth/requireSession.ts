import { auth }         from '@/auth';
import { redirect }     from 'next/navigation';
import type { Permission } from '@/lib/permissions';

export async function requireSession(perm?: Permission) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  if (perm && !session.user.isSuperAdmin && !session.user.permissions.includes(perm)) {
    redirect('/unauthorized');
  }

  return session;
}

/** Returns the active company DB name from session — throws if none selected. */
export function getActiveDbName(
  session: Awaited<ReturnType<typeof requireSession>>
): string {
  const db = session.user.activeCompanyDbName;
  if (!db) throw new Error('No active company selected');
  return db;
}
