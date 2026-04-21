import type { Prisma } from '@prisma/client';

/** Matches `scripts/seed.ts` — Employee (self-service) role slug */
export const EMPLOYEE_SELF_ROLE_SLUG = 'employee-self';

export type ProvisionResult =
  | { ok: true; userId: string; createdUser: boolean }
  | { ok: false; code: 'NO_ROLE' | 'EMAIL_LINKED_OTHER' | 'EMAIL_USER_CONFLICT'; message: string };

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

  const role = await db.role.findFirst({ where: { slug: EMPLOYEE_SELF_ROLE_SLUG } });
  if (!role) {
    return {
      ok: false,
      code: 'NO_ROLE',
      message: `Missing role "${EMPLOYEE_SELF_ROLE_SLUG}". Run database seed or create this system role.`,
    };
  }

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
      // Target email belongs to another employee-linked account: hard conflict.
      if (existingUser.linkedEmployeeId && existingUser.linkedEmployeeId !== params.employeeId) {
        return {
          ok: false,
          code: 'EMAIL_LINKED_OTHER',
          message: 'This email is already linked to another employee account.',
        };
      }
      // Target email belongs to a standalone user account. Avoid implicit merge.
      return {
        ok: false,
        code: 'EMAIL_USER_CONFLICT',
        message: 'This email is already used by another user account. Resolve or unlink it first.',
      };
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
      await db.userCompanyAccess.create({
        data: {
          userId: linkedUser.id,
          companyId: params.companyId,
          roleId: role.id,
        },
      });
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
    if (existingUser.linkedEmployeeId && existingUser.linkedEmployeeId !== params.employeeId) {
      return {
        ok: false,
        code: 'EMAIL_LINKED_OTHER',
        message: 'This email is already linked to another employee account.',
      };
    }

    await db.user.update({
      where: { id: existingUser.id },
      data: {
        linkedEmployeeId: params.employeeId,
        name: existingUser.name?.trim() ? existingUser.name : params.fullName,
        isActive: true,
      },
    });

    const hasAccess = existingUser.companyAccess.some((a) => a.companyId === params.companyId);
    if (!hasAccess) {
      await db.userCompanyAccess.create({
        data: {
          userId: existingUser.id,
          companyId: params.companyId,
          roleId: role.id,
        },
      });
    }

    if (!existingUser.activeCompanyId) {
      await db.user.update({
        where: { id: existingUser.id },
        data: { activeCompanyId: params.companyId },
      });
    }

    return { ok: true, userId: existingUser.id, createdUser: false };
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
