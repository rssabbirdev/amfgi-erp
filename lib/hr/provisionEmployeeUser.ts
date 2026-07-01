import type { Prisma } from '@prisma/client';
import { EMPLOYEE_SELF_ROLE_SLUG } from '@/lib/permissions';
import { ensureEmployeeSelfServiceRole } from '@/lib/hr/ensureEmployeeSelfServiceRole';
import { syncUserCompanyAccess } from '@/lib/auth/syncUserCompanyAccess';
import {
  checkEmployeeEmailUserConflict,
  EMAIL_USER_CONFLICT_MESSAGE,
} from '@/lib/hr/employeeEmailUserConflict';

export { EMPLOYEE_SELF_ROLE_SLUG };

export type ProvisionResult =
  | { ok: true; userId: string; createdUser: boolean }
  | { ok: false; code: 'EMAIL_LINKED_OTHER' | 'EMAIL_USER_CONFLICT'; message: string };

/**
 * Ensures a `User` exists for `email`, is linked to this employee, and has company access
 * with the employee self-service role (Google / future password login).
 */
export async function provisionEmployeeUser(
  db: Prisma.TransactionClient,
  params: {
    employeeId: string;
    companyId: string;
    email: string;
    fullName: string;
  }
): Promise<ProvisionResult> {
  const emailNorm = params.email.trim().toLowerCase();
  if (!emailNorm) {
    return { ok: false, code: 'EMAIL_USER_CONFLICT', message: 'Email is required to provision login' };
  }

  const role = await ensureEmployeeSelfServiceRole(db);

  const linkedUser = await db.user.findUnique({
    where: { linkedEmployeeId: params.employeeId },
    include: { companyAccess: true },
  });

  const existingUser = await db.user.findUnique({
    where: { email: emailNorm },
    include: { companyAccess: true },
  });

  // Employee already has a linked user account. Keep that account and sync its email.
  if (linkedUser) {
    if (existingUser && existingUser.id !== linkedUser.id) {
      const conflict = await checkEmployeeEmailUserConflict(db, {
        email: emailNorm,
        employeeId: params.employeeId,
        allowedUserId: linkedUser.id,
      });
      if (!conflict.ok) {
        return { ok: false, code: conflict.code, message: conflict.message };
      }
    }

    await db.user.update({
      where: { id: linkedUser.id },
      data: {
        email: emailNorm,
        linkedEmployeeId: params.employeeId,
        name: linkedUser.name?.trim() ? linkedUser.name : params.fullName,
        isActive: true,
      },
    });

    const hasAccess = linkedUser.companyAccess.some((a) => a.companyId === params.companyId);
    if (!hasAccess) {
      await syncUserCompanyAccess(db, linkedUser.id, [
        { companyId: params.companyId, roleId: role.id },
      ]);
    }

    if (!linkedUser.activeCompanyId) {
      await db.user.update({
        where: { id: linkedUser.id },
        data: { activeCompanyId: params.companyId },
      });
    }

    return { ok: true, userId: linkedUser.id, createdUser: false };
  }

  if (existingUser) {
    const conflict = await checkEmployeeEmailUserConflict(db, {
      email: emailNorm,
      employeeId: params.employeeId,
    });
    if (!conflict.ok) {
      return { ok: false, code: conflict.code, message: conflict.message };
    }

    if (existingUser.linkedEmployeeId === params.employeeId) {
      const hasAccess = existingUser.companyAccess.some((a) => a.companyId === params.companyId);
      if (!hasAccess) {
        await syncUserCompanyAccess(db, existingUser.id, [
          { companyId: params.companyId, roleId: role.id },
        ]);
      }

      if (!existingUser.activeCompanyId) {
        await db.user.update({
          where: { id: existingUser.id },
          data: { activeCompanyId: params.companyId },
        });
      }

      return { ok: true, userId: existingUser.id, createdUser: false };
    }

    return {
      ok: false,
      code: 'EMAIL_USER_CONFLICT',
      message: EMAIL_USER_CONFLICT_MESSAGE,
    };
  }

  const created = await db.user.create({
    data: {
      name: params.fullName,
      email: emailNorm,
      password: null,
      isActive: true,
      activeCompanyId: params.companyId,
      linkedEmployeeId: params.employeeId,
      companyAccess: {
        create: {
          companyId: params.companyId,
          roleId: role.id,
        },
      },
    },
    select: { id: true },
  });

  return { ok: true, userId: created.id, createdUser: true };
}
