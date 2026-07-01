import type { Prisma } from '@prisma/client';

import { isEmployeeSelfServiceAccount } from '@/lib/auth/selfService';

export class DeleteSelfServiceUserError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_SELF_SERVICE' | 'NOT_FOUND' | 'BLOCKED'
  ) {
    super(message);
    this.name = 'DeleteSelfServiceUserError';
  }
}

/**
 * Permanently removes an employee portal login. The linked employee record is kept;
 * only `portalEnabled` is cleared and the user account is deleted.
 */
export async function deleteSelfServiceUser(
  db: Prisma.TransactionClient,
  userId: string
): Promise<{ employeeId: string; companyId: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuperAdmin: true, linkedEmployeeId: true },
  });

  if (!user) {
    throw new DeleteSelfServiceUserError('User not found', 'NOT_FOUND');
  }

  if (!isEmployeeSelfServiceAccount(user)) {
    throw new DeleteSelfServiceUserError(
      'Only employee self-service logins can be permanently deleted from here',
      'NOT_SELF_SERVICE'
    );
  }

  const employeeId = user.linkedEmployeeId!;
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, companyId: true },
  });

  if (!employee) {
    throw new DeleteSelfServiceUserError('Linked employee not found', 'NOT_FOUND');
  }

  await db.employee.update({
    where: { id: employeeId },
    data: { portalEnabled: false },
  });

  await db.user.delete({ where: { id: userId } });

  return { employeeId: employee.id, companyId: employee.companyId };
}
