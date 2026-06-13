import { auth } from '@/auth';
import { canAccessSettingsStorage } from '@/lib/auth/settingsAccess';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';
import { getGlobalGoogleDriveConfig, setGlobalGoogleDriveConfig } from '@/lib/utils/globalSettings';
import { validateDriveFolderAccess } from '@/lib/utils/googleDrive';
import type { Session } from 'next-auth';

function canManageDrive(session: Session | null) {
  if (!session?.user) return false;
  return canAccessSettingsStorage({
    isSuperAdmin: session.user.isSuperAdmin ?? false,
    permissions: (session.user.permissions ?? []) as string[],
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageDrive(session)) return errorResponse('Forbidden', 403);
  const config = await getGlobalGoogleDriveConfig();
  const hasEnvRootFolder = Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim());
  const hasGlobalRootFolder = Boolean(config.rootFolderId?.trim());

  return successResponse({
    connected: Boolean(config.refreshToken),
    connectedAt: config.connectedAt ?? null,
    connectedEmail: config.connectedEmail ?? null,
    rootFolderId: config.rootFolderId,
    rootFolderConfigured: hasGlobalRootFolder || hasEnvRootFolder,
    rootFolderSource: hasGlobalRootFolder ? 'global' : hasEnvRootFolder ? 'env' : 'none',
    oauthClientConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
  });
}

const UpdateSchema = z.object({
  rootFolderId: z.string().trim().optional().or(z.literal('')),
});

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageDrive(session)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const rootFolderIdRaw = parsed.data.rootFolderId;
  const nextRootFolderId = rootFolderIdRaw && rootFolderIdRaw.trim().length > 0 ? rootFolderIdRaw.trim() : null;
  if (nextRootFolderId) {
    try {
      await validateDriveFolderAccess(nextRootFolderId);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Drive folder access validation failed', 422);
    }
  }
  const next = await setGlobalGoogleDriveConfig({ rootFolderId: nextRootFolderId });

  return successResponse({
    rootFolderId: next.rootFolderId,
    rootFolderConfigured: Boolean(next.rootFolderId) || Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()),
    rootFolderSource: next.rootFolderId ? 'global' : process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() ? 'env' : 'none',
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageDrive(session)) return errorResponse('Forbidden', 403);
  await setGlobalGoogleDriveConfig({
    refreshToken: null,
    connectedAt: null,
    connectedEmail: null,
  });

  return successResponse({ ok: true });
}
