import type { Prisma } from '@prisma/client';

export type EmployeeEmailUserConflict =
  | { ok: true }
  | { ok: false; code: 'EMAIL_USER_CONFLICT' | 'EMAIL_LINKED_OTHER'; message: string };

export const EMAIL_USER_CONFLICT_MESSAGE =
  'This email is already used by another ERP user account. Use a different email or link that account from Account access.';

export const EMAIL_LINKED_OTHER_MESSAGE =
  'This email is already linked to another employee account.';

export function normalizeEmployeeEmail(email: string | null | undefined): string | null {
  if (email == null || !String(email).trim()) return null;
  return String(email).trim().toLowerCase();
}

type UserLookupDb = Pick<Prisma.TransactionClient, 'user'>;

/**
 * Rejects employee emails that collide with an existing ERP `User`, unless that user
 * is already the linked login for this employee.
 */
export async function checkEmployeeEmailUserConflict(
  db: UserLookupDb,
  params: {
    email: string;
    employeeId?: string;
    /** When set, this user id may already own the email (linked self-service account). */
    allowedUserId?: string | null;
  }
): Promise<EmployeeEmailUserConflict> {
  const emailNorm = normalizeEmployeeEmail(params.email);
  if (!emailNorm) return { ok: true };

  const user = await db.user.findUnique({
    where: { email: emailNorm },
    select: { id: true, linkedEmployeeId: true },
  });

  if (!user) return { ok: true };

  if (params.allowedUserId && user.id === params.allowedUserId) return { ok: true };

  if (params.employeeId && user.linkedEmployeeId === params.employeeId) return { ok: true };

  if (user.linkedEmployeeId && user.linkedEmployeeId !== params.employeeId) {
    return { ok: false, code: 'EMAIL_LINKED_OTHER', message: EMAIL_LINKED_OTHER_MESSAGE };
  }

  return { ok: false, code: 'EMAIL_USER_CONFLICT', message: EMAIL_USER_CONFLICT_MESSAGE };
}

export function employeeEmailConflictStatus(code: 'EMAIL_USER_CONFLICT' | 'EMAIL_LINKED_OTHER'): number {
  return code === 'EMAIL_LINKED_OTHER' ? 409 : 422;
}
