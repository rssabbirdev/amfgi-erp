import { auth }            from '@/auth';
import { syncUserCompanyAccess } from '@/lib/auth/syncUserCompanyAccess';
import { isEmployeeSelfServiceAccount } from '@/lib/auth/selfService';
import { assertCanDeactivateUser } from '@/lib/auth/userSelfProtection';
import { deleteSelfServiceUser, DeleteSelfServiceUserError } from '@/lib/hr/deleteSelfServiceUser';
import { prisma }          from '@/lib/db/prisma';
import { GLOBAL_LIVE_UPDATE_COMPANY_ID, publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { Prisma }          from '@prisma/client';
import { z }               from 'zod';
import bcrypt              from 'bcryptjs';

const UpdateSchema = z.object({
  name:         z.string().min(1).max(100).optional(),
  isSuperAdmin: z.boolean().optional(),
  isActive:     z.boolean().optional(),
  password:     z.string().min(8).optional(),
  companyAccess: z.array(z.object({
    companyId: z.string().min(1),
    roleId:    z.string().min(1),
  })).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('user.view')) {
    return errorResponse('Forbidden', 403);
  }
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      companyAccess: {
        include: {
          company: { select: { id: true, name: true, slug: true } },
          role: { select: { id: true, name: true } },
        },
      },
      activeCompany: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!user) return errorResponse('User not found', 404);
  return successResponse(user);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('user.edit')) {
    return errorResponse('Forbidden', 403);
  }
  const { id } = await params;

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return errorResponse('User not found', 404);

  if (parsed.data.isActive === false) {
    const blocked = assertCanDeactivateUser(session.user.id, existing);
    if (blocked) return errorResponse(blocked, 403);
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const update: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) update.name = parsed.data.name;
      if (parsed.data.isSuperAdmin !== undefined) update.isSuperAdmin = parsed.data.isSuperAdmin;
      if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;
      if (parsed.data.password) {
        update.password = await bcrypt.hash(parsed.data.password, 12);
      }

      await tx.user.update({ where: { id }, data: update });

      if (parsed.data.companyAccess) {
        await syncUserCompanyAccess(tx, id, parsed.data.companyAccess);
      }

      return tx.user.findUnique({
        where: { id },
        include: {
          companyAccess: {
            include: {
              company: { select: { id: true, name: true, slug: true } },
              role: { select: { id: true, name: true } },
            },
          },
          activeCompany: { select: { id: true, name: true, slug: true } },
        },
      });
    });

    publishLiveUpdate({
      companyId: GLOBAL_LIVE_UPDATE_COMPANY_ID,
      channel: 'admin',
      entity: 'user',
      action: 'updated',
    });
    return successResponse(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return errorResponse('Duplicate company and role assignment for this user', 409);
      }
      if (err.code === 'P2003') {
        return errorResponse('Invalid company or role ID', 422);
      }
    }
    if (err instanceof Error && err.message.includes('Foreign key constraint')) {
      return errorResponse('Invalid company or role ID', 422);
    }
    throw err;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const { id } = await params;

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, isSuperAdmin: true, linkedEmployeeId: true },
  });
  if (!existing) return errorResponse('User not found', 404);

  const blocked = assertCanDeactivateUser(session.user.id, existing);
  if (blocked) return errorResponse(blocked, 403);

  if (isEmployeeSelfServiceAccount(existing)) {
    const canDeleteSelfService =
      session.user.isSuperAdmin || session.user.permissions.includes(P.USER_DELETE);
    if (!canDeleteSelfService) return errorResponse('Forbidden', 403);

    try {
      const result = await prisma.$transaction((tx) => deleteSelfServiceUser(tx, id));

      publishLiveUpdate({
        companyId: GLOBAL_LIVE_UPDATE_COMPANY_ID,
        channel: 'admin',
        entity: 'user',
        action: 'deleted',
      });
      publishLiveUpdate({
        companyId: result.companyId,
        channel: 'hr',
        entity: 'employee',
        action: 'updated',
      });

      return successResponse({
        deleted: true,
        permanent: true,
        employeeId: result.employeeId,
      });
    } catch (err) {
      if (err instanceof DeleteSelfServiceUserError) {
        const status = err.code === 'NOT_FOUND' ? 404 : 422;
        return errorResponse(err.message, status);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        return errorResponse(
          'This login cannot be deleted because it is referenced by other records. Deactivate it instead.',
          409
        );
      }
      throw err;
    }
  }

  if (!session.user.isSuperAdmin) return errorResponse('Forbidden', 403);

  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });

  publishLiveUpdate({
    companyId: GLOBAL_LIVE_UPDATE_COMPANY_ID,
    channel: 'admin',
    entity: 'user',
    action: 'deleted',
  });
  return successResponse({ deleted: true, permanent: false });
}
