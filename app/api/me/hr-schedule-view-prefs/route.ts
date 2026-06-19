import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  SCHEDULE_VIEW_PREFS_DB_KEY,
  defaultScheduleViewPrefs,
  normalizeScheduleViewPrefs,
} from '@/lib/hr/scheduleViewPrefs';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

const ScheduleRowSettingsSchema = z.object({
  order: z.array(z.string().min(1)),
  hidden: z.array(z.string().min(1)),
});

const ScheduleViewPrefsSchema = z.object({
  showWorkerRail: z.boolean(),
  showRowLabels: z.boolean(),
  viewScale: z.number().min(0.8).max(1.35),
  useLightGridTheme: z.boolean(),
  rowSettings: ScheduleRowSettingsSchema,
});

function isAbortedRequest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message === 'aborted' || (error as NodeJS.ErrnoException).code === 'ECONNRESET';
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return errorResponse('Unauthorized', 401);
    if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

    const preference = await prisma.userTablePreference.findUnique({
      where: {
        userId_companyId_key: {
          userId: session.user.id,
          companyId: session.user.activeCompanyId,
          key: SCHEDULE_VIEW_PREFS_DB_KEY,
        },
      },
    });

    if (!preference?.state) {
      return successResponse(null);
    }

    return successResponse(normalizeScheduleViewPrefs(preference.state));
  } catch (error) {
    if (isAbortedRequest(error)) {
      return errorResponse('Request aborted', 499);
    }
    console.error('Failed to load HR schedule view preferences', error);
    return errorResponse('Schedule view preference storage unavailable', 503);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return errorResponse('Unauthorized', 401);
    if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

    const body = await req.json();
    const parsed = ScheduleViewPrefsSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
    }

    const state = normalizeScheduleViewPrefs(parsed.data);

    const preference = await prisma.userTablePreference.upsert({
      where: {
        userId_companyId_key: {
          userId: session.user.id,
          companyId: session.user.activeCompanyId,
          key: SCHEDULE_VIEW_PREFS_DB_KEY,
        },
      },
      update: { state },
      create: {
        userId: session.user.id,
        companyId: session.user.activeCompanyId,
        key: SCHEDULE_VIEW_PREFS_DB_KEY,
        state,
      },
    });

    return successResponse(normalizeScheduleViewPrefs(preference.state ?? defaultScheduleViewPrefs()));
  } catch (error) {
    if (isAbortedRequest(error)) {
      return errorResponse('Request aborted', 499);
    }
    console.error('Failed to save HR schedule view preferences', error);
    return errorResponse('Schedule view preference storage unavailable', 503);
  }
}
