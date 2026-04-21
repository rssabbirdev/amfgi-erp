import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db/prisma';
import { runScheduleCsvImport } from '@/lib/hr/runScheduleCsvImport';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_SCHEDULE_EDIT)) return errorResponse('Forbidden', 403);
  const { id: scheduleId } = await params;

  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('multipart/form-data')) {
    return errorResponse('Expected multipart/form-data with field "file"', 400);
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!file || !(file instanceof Blob)) {
    return errorResponse('Missing file', 400);
  }

  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  let csvText: string;
  try {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const name = wb.SheetNames[0];
    if (!name) return errorResponse('Workbook has no sheets', 422);
    const ws = wb.Sheets[name];
    csvText = XLSX.utils.sheet_to_csv(ws);
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Failed to read XLSX', 422);
  }

  const result = await runScheduleCsvImport(prisma, {
    companyId,
    scheduleId,
    csvText,
  });

  if (result.error === 'NOT_FOUND') return errorResponse('Not found', 404);
  if (result.error === 'LOCKED') return errorResponse('Schedule is locked', 403);
  if (result.error === 'PARSE') return errorResponse(result.message ?? 'Parse failed', 422);
  if (result.error === 'DATE_MISMATCH') return errorResponse('Sheet date does not match this schedule work date', 422);

  return successResponse({ schedule: result.schedule, warnings: result.warnings });
}
