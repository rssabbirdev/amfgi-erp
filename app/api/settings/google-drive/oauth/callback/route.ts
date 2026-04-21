import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import {
  readCompanyGoogleDriveOAuthConfig,
  writeCompanyGoogleDriveOAuthConfig,
} from '@/lib/utils/companyPrintTemplates';
import { exchangeGoogleDriveAuthorizationCode, explainGoogleDriveError } from '@/lib/utils/googleDrive';
import { cookies } from 'next/headers';

function redirectToSettings(request: Request, status: string, message?: string) {
  const url = new URL('/settings', request.url);
  url.searchParams.set('tab', 'company');
  url.searchParams.set('googleDrive', status);
  if (message) url.searchParams.set('googleDriveMessage', message);
  return Response.redirect(url, 302);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return redirectToSettings(request, 'error', 'Unauthorized');

  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim();
  const state = url.searchParams.get('state')?.trim();
  const oauthError = url.searchParams.get('error')?.trim();
  if (oauthError) {
    return redirectToSettings(request, 'error', oauthError);
  }
  if (!code || !state) {
    return redirectToSettings(request, 'error', 'Missing OAuth response data');
  }

  const cookieStore = await cookies();
  const rawState = cookieStore.get('google_drive_oauth_state')?.value;
  cookieStore.delete('google_drive_oauth_state');

  let expectedState = '';
  let companyId = '';
  try {
    const parsed = rawState ? (JSON.parse(rawState) as { state?: string; companyId?: string }) : null;
    expectedState = parsed?.state?.trim() ?? '';
    companyId = parsed?.companyId?.trim() ?? '';
  } catch {
    expectedState = '';
    companyId = '';
  }

  if (!expectedState || expectedState !== state || !companyId) {
    return redirectToSettings(request, 'error', 'Google Drive authorization state mismatch');
  }

  try {
    const { refreshToken, connectedEmail } = await exchangeGoogleDriveAuthorizationCode({
      code,
      origin: url.origin,
    });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { printTemplates: true },
    });
    if (!company) {
      return redirectToSettings(request, 'error', 'Company not found');
    }

    const existing = readCompanyGoogleDriveOAuthConfig(company.printTemplates);
    const merged = writeCompanyGoogleDriveOAuthConfig(company.printTemplates, {
      refreshToken,
      connectedAt: new Date().toISOString(),
      connectedEmail: connectedEmail ?? existing?.connectedEmail ?? null,
    });

    await prisma.company.update({
      where: { id: companyId },
      data: { printTemplates: merged as Prisma.InputJsonValue },
    });

    return redirectToSettings(request, 'connected', connectedEmail ?? 'Connected');
  } catch (error) {
    return redirectToSettings(request, 'error', explainGoogleDriveError(error));
  }
}
