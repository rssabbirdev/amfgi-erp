import { auth } from '@/auth';
import { canAccessSettingsEmail } from '@/lib/auth/settingsAccess';
import { prisma } from '@/lib/db/prisma';
import { sendMail } from '@/lib/mail/sendMail';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !canAccessSettingsEmail({
      isSuperAdmin: session.user.isSuperAdmin,
      permissions: session.user.permissions,
    })
  ) {
    return errorResponse('Forbidden', 403);
  }

  const to = session.user.email?.trim();
  if (!to) return errorResponse('Your account has no email address', 400);

  const result = await sendMail(prisma, {
    to,
    subject: 'AMFGI ERP — test email',
    html: '<p>This is a test message from your AMFGI ERP email settings.</p>',
    text: 'This is a test message from your AMFGI ERP email settings.',
  });

  if (!result.sent && !result.devLogged) {
    return errorResponse('Failed to send test email. Check provider settings and logs.', 502);
  }

  return successResponse({
    sent: result.sent,
    devLogged: result.devLogged,
    provider: result.provider,
    message: result.sent
      ? `Test email sent to ${to}`
      : 'Mail is not fully configured; check server logs in development.',
  });
}
