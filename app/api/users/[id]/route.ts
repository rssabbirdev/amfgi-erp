import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
import { GLOBAL_LIVE_UPDATE_COMPANY_ID, publishLiveUpdate } from '@/lib/live-updates/server';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
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

  try {
    const user = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) return null;

      const update: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) update.name = parsed.data.name;
      if (parsed.data.isSuperAdmin !== undefined) update.isSuperAdmin = parsed.data.isSuperAdmin;
      if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;
      if (parsed.data.password) {
        update.password = await bcrypt.hash(parsed.data.password, 12);
      }

      await tx.user.update({ where: { id }, data: update });

      if (parsed.data.companyAccess) {
        await tx.userCompanyAccess.deleteMany({ where: { userId: id } });
        for (const access of parsed.data.companyAccess) {
          await tx.userCompanyAccess.create({
            data: {
              userId:    id,
              companyId: access.companyId,
              roleId:    access.roleId,
            },
          });
        }
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

    if (!user) return errorResponse('User not found', 404);
    publishLiveUpdate({
      companyId: GLOBAL_LIVE_UPDATE_COMPANY_ID,
      channel: 'admin',
      entity: 'user',
      action: 'updated',
    });
    return successResponse(user);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Foreign key constraint')) {
      return errorResponse('Invalid company or role ID', 422);
    }
    throw err;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);
  const { id } = await params;

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
  return successResponse({ deleted: true });
}
