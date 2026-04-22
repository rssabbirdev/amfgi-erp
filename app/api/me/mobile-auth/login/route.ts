import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { generateEmployeeMobileToken } from '@/lib/hr/mobileAccess';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceLabel: z.string().max(120).optional().nullable(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.trim().toLowerCase() },
    include: {
      activeCompany: { select: { id: true, name: true, slug: true } },
      linkedEmployee: { select: { id: true, fullName: true, employeeCode: true, portalEnabled: true, companyId: true, status: true } },
    },
  });
  if (!user || !user.password || !user.isActive) return errorResponse('Invalid login credentials', 401);

  const valid = await bcrypt.compare(parsed.data.password, user.password);
  if (!valid) return errorResponse('Invalid login credentials', 401);
  if (!user.activeCompanyId || !user.activeCompany) return errorResponse('No active company selected for this user', 400);
  if (!user.linkedEmployee || user.linkedEmployee.companyId !== user.activeCompanyId) {
    return errorResponse('No linked employee for the active company', 403);
  }
  if (!user.linkedEmployee.portalEnabled) return errorResponse('Employee portal is disabled', 403);

  const { plainTextToken, tokenPrefix, tokenHash } = generateEmployeeMobileToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  const tokenRow = await prisma.employeeMobileAccessToken.create({
    data: {
      companyId: user.activeCompanyId,
      userId: user.id,
      employeeId: user.linkedEmployee.id,
      tokenLabel: parsed.data.deviceLabel?.trim() || 'Expo Mobile Session',
      tokenPrefix,
      tokenHash,
      expiresAt,
    },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return successResponse(
    {
      token: plainTextToken,
      tokenType: 'Bearer',
      expiresAt: tokenRow.expiresAt,
      employee: {
        id: user.linkedEmployee.id,
        fullName: user.linkedEmployee.fullName,
        employeeCode: user.linkedEmployee.employeeCode,
        status: user.linkedEmployee.status,
      },
      company: {
        id: user.activeCompany.id,
        name: user.activeCompany.name,
        slug: user.activeCompany.slug,
      },
    },
    201
  );
}
