import { auth } from '@/auth';
import { canAccessSettingsStorage } from '@/lib/auth/settingsAccess';
import { errorResponse } from '@/lib/utils/apiResponse';
import { createGoogleDriveAuthorizationUrl } from '@/lib/utils/googleDrive';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import type { Session } from 'next-auth';

function canManageDrive(session: Session | null) {
  if (!session?.user) return false;
  return canAccessSettingsStorage({
    isSuperAdmin: session.user.isSuperAdmin ?? false,
    permissions: (session.user.permissions ?? []) as string[],
  });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageDrive(session)) return errorResponse('Forbidden', 403);
  if (!process.env.GOOGLE_CLIENT_ID?.trim() || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    return errorResponse('Google OAuth client is not configured', 500);
  }

  const state = randomUUID();
  const origin = new URL(request.url).origin;
  const cookieStore = await cookies();
  cookieStore.set(
    'google_drive_oauth_state',
    JSON.stringify({ state }),
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
