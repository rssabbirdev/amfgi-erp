import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
import { GLOBAL_LIVE_UPDATE_COMPANY_ID, publishLiveUpdate } from '@/lib/live-updates/server';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }               from 'zod';
import bcrypt              from 'bcryptjs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('user.view')) {
    return errorResponse('Forbidden', 403);
  }

  const users = await prisma.user.findMany({
    include: {
      companyAccess: {
        include: {
          company: { select: { id: true, name: true, slug: true } },
          role: { select: { id: true, name: true } },
        },
      },
      activeCompany: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return successResponse(users);
}

const CreateUserSchema = z.object({
  name:         z.string().min(1).max(100),
  email:        z.string().email(),
  password:     z.string().min(8).optional(),
  isSuperAdmin: z.boolean().default(false),
  companyAccess: z.array(z.object({
    companyId: z.string().min(1),
    roleId:    z.string().min(1),
  })).default([]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('user.create')) {
    return errorResponse('Forbidden', 403);
  }

  const body   = await req.json();
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return errorResponse('Email already registered', 409);
  }

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name:         parsed.data.name,
          email:        parsed.data.email,
          isSuperAdmin: parsed.data.isSuperAdmin,
          password: parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : null,
        },
      });

      for (const access of parsed.data.companyAccess) {
        await tx.userCompanyAccess.create({
          data: {
            userId:    newUser.id,
            companyId: access.companyId,
            roleId:    access.roleId,
          },
        });
      }

      return tx.user.findUnique({
        where: { id: newUser.id },
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
  } catch (err) {
    if (err instanceof Error && err.message.includes('Foreign key constraint')) {
      return errorResponse('Invalid company or role ID', 422);
    }
    throw err;
  }

  publishLiveUpdate({
    companyId: GLOBAL_LIVE_UPDATE_COMPANY_ID,
    channel: 'admin',
    entity: 'user',
    action: 'created',
  });
  return successResponse(user, 201);
}
