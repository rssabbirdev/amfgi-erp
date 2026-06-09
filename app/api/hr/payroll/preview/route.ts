import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { buildPayrollPreview } from '@/lib/hr/payroll/buildPayPreview';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_PAYROLL_COMPENSATION)) {
    return errorResponse('Forbidden', 403);
  }

  const { searchParams } = new URL(req.url);
  const month = String(searchParams.get('month') ?? '').trim();
  if (!month) return errorResponse('month query required (YYYY-MM)', 400);

  const employeeId = String(searchParams.get('employeeId') ?? '').trim() || null;

  try {
    const preview = await buildPayrollPreview(companyId, month, employeeId);
    const totalGross = preview.employees
      .filter((e) => !e.skipped)
      .reduce((sum, e) => sum + e.gross, 0);
    return successResponse({ ...preview, totalGross: Math.round(totalGross * 100) / 100 });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Preview failed', 400);
  }
}
