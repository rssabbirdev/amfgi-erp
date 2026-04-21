import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  basicHoursForProfileExtension,
  employeeTypeFromProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
} from '@/lib/hr/employeeTypeSettings';

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');
  if (!workDateRaw) return errorResponse('workDate query required (YYYY-MM-DD)', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  const [company, rows] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { hrEmployeeTypeSettings: true, printTemplates: true } }),
    prisma.attendanceEntry.findMany({
    where: { companyId, workDate },
    include: {
      employee: { select: { id: true, fullName: true, preferredName: true, employeeCode: true, status: true, profileExtension: true } },
      workAssignment: {
        select: {
          id: true,
          label: true,
          jobNumberSnapshot: true,
          siteNameSnapshot: true,
          clientNameSnapshot: true,
          projectDetailsSnapshot: true,
          factoryCode: true,
          shiftStart: true,
          shiftEnd: true,
          breakWindow: true,
          locationType: true,
          job: {
            select: {
              jobNumber: true,
              site: true,
              projectName: true,
              projectDetails: true,
              customer: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ employee: { fullName: 'asc' } }],
      take: 2000,
    }),
  ]);
  const typeSettings = readEmployeeTypeSettingsFromCompanyData(company);
  return successResponse(
    rows.map((row) => ({
      ...row,
      employee: {
        ...row.employee,
        status: (row.employee as { status?: string }).status ?? 'ACTIVE',
        employeeType: employeeTypeFromProfileExtension(row.employee.profileExtension),
        basicHoursPerDay: basicHoursForProfileExtension(row.employee.profileExtension, typeSettings),
        defaultTiming: (() => {
          const employeeType = employeeTypeFromProfileExtension(row.employee.profileExtension);
          const timing = typeSettings[employeeType];
          return timing
            ? {
                dutyStart: timing.dutyStart,
                dutyEnd: timing.dutyEnd,
                breakStart: timing.breakStart,
                breakEnd: timing.breakEnd,
              }
            : null;
        })(),
      },
      workAssignment: row.workAssignment
        ? {
            ...row.workAssignment,
            costingSnapshot: {
              jobNumber: row.workAssignment.jobNumberSnapshot || row.workAssignment.job?.jobNumber || null,
              siteName: row.workAssignment.siteNameSnapshot || row.workAssignment.job?.site || null,
              customerName: row.workAssignment.clientNameSnapshot || row.workAssignment.job?.customer?.name || null,
              projectName: row.workAssignment.job?.projectName || null,
              projectDetails: row.workAssignment.projectDetailsSnapshot || row.workAssignment.job?.projectDetails || null,
            },
          }
        : null,
    }))
  );
}

export async function DELETE(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_ATTENDANCE_EDIT)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const workDateRaw = searchParams.get('workDate');
  if (!workDateRaw) return errorResponse('workDate query required (YYYY-MM-DD)', 400);

  let workDateYmd: string;
  try {
    workDateYmd = ymdFromInput(workDateRaw);
  } catch {
    return errorResponse('Invalid workDate', 400);
  }
  const workDate = dateFromYmd(workDateYmd);

  const result = await prisma.attendanceEntry.deleteMany({
    where: { companyId, workDate },
  });
  return successResponse({ ok: true, deletedRows: result.count });
}
