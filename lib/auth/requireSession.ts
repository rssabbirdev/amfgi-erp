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

