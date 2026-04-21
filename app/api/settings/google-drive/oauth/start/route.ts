import { auth } from '@/auth';
import { errorResponse } from '@/lib/utils/apiResponse';
import { createGoogleDriveAuthorizationUrl } from '@/lib/utils/googleDrive';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import type { Session } from 'next-auth';

function canManageDrive(session: Session | null) {
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  return isSA || perms.includes('settings.manage');
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageDrive(session)) return errorResponse('Forbidden', 403);

  const companyId = session.user.activeCompanyId;
  if (!companyId) return errorResponse('No active company selected', 400);
  if (!process.env.GOOGLE_CLIENT_ID?.trim() || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    return errorResponse('Google OAuth client is not configured', 500);
  }

  const state = randomUUID();
  const origin = new URL(request.url).origin;
  const cookieStore = await cookies();
  cookieStore.set(
    'google_drive_oauth_state',
    JSON.stringify({ state, companyId }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: origin.startsWith('https://'),
      path: '/',
      maxAge: 60 * 10,
    },
  );

  return Response.redirect(createGoogleDriveAuthorizationUrl(origin, state), 302);
}
