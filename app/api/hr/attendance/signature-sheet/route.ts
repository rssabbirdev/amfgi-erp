import { prisma } from '@/lib/db/prisma';
import {
  loadAttendanceSignatureSheet,
  SignatureSheetNoEmployeesError,
} from '@/lib/hr/buildAttendanceSignatureSheet';
import { ymdFromInput } from '@/lib/hr/workDate';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const group = (searchParams.get('group') ?? '').trim();
  const workDateRaw = searchParams.get('workDate');

  if (!group) return errorResponse('group query param is required', 400);
  if (!workDateRaw) return errorResponse('workDate query param is required (YYYY-MM-DD)', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }

  try {
    const payload = await loadAttendanceSignatureSheet(prisma, companyId, workDateYmd, group);
    return successResponse(payload);
  } catch (error) {
    if (error instanceof SignatureSheetNoEmployeesError) {
      return errorResponse(error.message, 404);
    }
    throw error;
  }
}
