import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import {
  readCompanyGoogleDriveOAuthConfig,
  writeCompanyGoogleDriveOAuthConfig,
} from '@/lib/utils/companyPrintTemplates';
import type { Session } from 'next-auth';

function canManageDrive(session: Session | null) {
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  return isSA || perms.includes('settings.manage');
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageDrive(session)) return errorResponse('Forbidden', 403);

  const companyId = session.user.activeCompanyId;
  if (!companyId) return errorResponse('No active company selected', 400);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, printTemplates: true },
  });
  if (!company) return errorResponse('Company not found', 404);

  const config = readCompanyGoogleDriveOAuthConfig(company.printTemplates);

  return successResponse({
    connected: Boolean(config?.refreshToken),
    connectedAt: config?.connectedAt ?? null,
    connectedEmail: config?.connectedEmail ?? null,
    rootFolderConfigured: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()),
    oauthClientConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
    companyName: company.name,
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageDrive(session)) return errorResponse('Forbidden', 403);

  const companyId = session.user.activeCompanyId;
  if (!companyId) return errorResponse('No active company selected', 400);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { printTemplates: true },
  });
  if (!company) return errorResponse('Company not found', 404);

  const nextPrintTemplates = writeCompanyGoogleDriveOAuthConfig(company.printTemplates, null);
  await prisma.company.update({
    where: { id: companyId },
    data: { printTemplates: nextPrintTemplates as Prisma.InputJsonValue },
  });

  return successResponse({ ok: true });
}
