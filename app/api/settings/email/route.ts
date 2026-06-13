import { auth } from '@/auth';
import { canAccessSettingsEmail } from '@/lib/auth/settingsAccess';
import { prisma } from '@/lib/db/prisma';
import {
  loadStoredEmailSettings,
  maskEmailSettingsForClient,
  mergeEmailSettingsPatch,
  saveEmailSettings,
  validateEmailSettings,
} from '@/lib/mail/emailSettings';
import { isMailConfigured } from '@/lib/mail/sendMail';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

function canManageSettings(user: {
  isSuperAdmin: boolean;
  permissions: string[];
}) {
  return canAccessSettingsEmail({
    isSuperAdmin: user.isSuperAdmin,
    permissions: user.permissions,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageSettings(session.user)) return errorResponse('Forbidden', 403);

  const stored = await loadStoredEmailSettings(prisma);
  const configured = await isMailConfigured(prisma);

  return successResponse({
    settings: maskEmailSettingsForClient(
      stored ?? { provider: 'env' },
    ),
    mailReady: configured,
    updatedAt: (
      await prisma.systemEmailSettings.findUnique({
        where: { id: 'global' },
        select: { updatedAt: true },
      })
    )?.updatedAt ?? null,
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canManageSettings(session.user)) return errorResponse('Forbidden', 403);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return errorResponse('Invalid JSON', 400);

  const existing = await loadStoredEmailSettings(prisma);
  const merged = mergeEmailSettingsPatch(existing, body);
  const validationError = validateEmailSettings(merged);
  if (validationError) return errorResponse(validationError, 422);

  await saveEmailSettings(prisma, merged, session.user.id);

  const configured = await isMailConfigured(prisma);
  return successResponse({
    settings: maskEmailSettingsForClient(merged),
    mailReady: configured,
    message: 'Email settings saved',
  });
}
