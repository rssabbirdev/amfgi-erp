import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  DEFAULT_EMPLOYEE_TYPE_SETTINGS,
  readEmployeeTypeSettingsFromCompanyData,
  writeEmployeeTypeSettingsIntoCompanyField,
  type EmployeeTypeSettingsMap,
} from '@/lib/hr/employeeTypeSettings';
import { z } from 'zod';

const ItemSchema = z.object({
  basicHoursPerDay: z.number().min(0.5).max(24),
  dutyStart: z.string().regex(/^\d{2}:\d{2}$/),
  dutyEnd: z.string().regex(/^\d{2}:\d{2}$/),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/),
});

const BodySchema = z.object({
  OFFICE_STAFF: ItemSchema,
  HYBRID_STAFF: ItemSchema,
  DRIVER: ItemSchema,
  LABOUR_WORKER: ItemSchema,
});

export async function GET() {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_VIEW)) return errorResponse('Forbidden', 403);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { hrEmployeeTypeSettings: true, printTemplates: true },
  });
  if (!company) return errorResponse('Company not found', 404);
  const settings = readEmployeeTypeSettingsFromCompanyData(company);
  return successResponse(settings);
}

export async function PUT(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { hrEmployeeTypeSettings: true, printTemplates: true },
  });
  if (!company) return errorResponse('Company not found', 404);

  const nextSettings = parsed.data as EmployeeTypeSettingsMap;
  const merged = writeEmployeeTypeSettingsIntoCompanyField({
    ...DEFAULT_EMPLOYEE_TYPE_SETTINGS,
    ...nextSettings,
  });
  const sanitizedPrintTemplates =
    company.printTemplates && typeof company.printTemplates === 'object' && !Array.isArray(company.printTemplates)
      ? (() => {
          const root = { ...(company.printTemplates as Record<string, unknown>) };
          delete root.hrEmployeeTypeSettings;
          return root as Prisma.InputJsonValue;
        })()
      : company.printTemplates ?? Prisma.JsonNull;

  await prisma.company.update({
    where: { id: companyId },
    data: {
      hrEmployeeTypeSettings: merged as Prisma.InputJsonValue,
      printTemplates: sanitizedPrintTemplates,
    },
  });

  return successResponse(nextSettings);
}
