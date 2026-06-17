import {
  holidayCriteriaCreateInput,
  holidayPayTypeInclude,
  serializeCompanyHoliday,
} from '@/lib/hr/payroll/companyHolidayQueries';
import { parseHolidayEmployeeCriteriaInput } from '@/lib/hr/payroll/holidayEmployeeEligibility';
import {
  resolveHolidayPayTypeLinks,
  syncCompanyHolidayPayTypes,
} from '@/lib/hr/payroll/validateHolidayPayType';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { hasPerm, requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const criteriaFields = {
  employmentTypes: z.array(z.string().min(1).max(80)).optional(),
  workforceRoleTypes: z.array(z.string().min(1).max(40)).optional(),
  visaHoldings: z.array(z.string().min(1).max(40)).optional(),
};

const HolidayPayTypeLinkSchema = z.object({
  payTypeId: z.string().min(1),
  payWorkedHoursAtOt: z.boolean().optional(),
  holidayOtPercent: z.number().int().min(1).max(500).optional().nullable(),
});

const CreateSchema = z.object({
  holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(160),
  isPaid: z.boolean().optional(),
  payTypes: z.array(HolidayPayTypeLinkSchema).optional(),
  /** @deprecated Use payTypes with OT settings per structure. */
  payTypeIds: z.array(z.string().min(1)).optional(),
  notes: z.string().max(2000).optional().nullable(),
  ...criteriaFields,
});

function parseYearParam(raw: string | null): number | null {
  if (!raw) return null;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

function parseCriteriaOrError(data: z.infer<typeof CreateSchema>) {
  try {
    return parseHolidayEmployeeCriteriaInput(data);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Invalid holiday eligibility criteria');
  }
}

function resolvePayTypeLinksInput(data: {
  payTypes?: z.infer<typeof HolidayPayTypeLinkSchema>[];
  payTypeIds?: string[];
}) {
  if (data.payTypes !== undefined) return data.payTypes;
  if (data.payTypeIds !== undefined) {
    return data.payTypeIds.map((payTypeId) => ({ payTypeId }));
  }
  return [];
}

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!hasPerm(session.user, P.HR_PAYROLL_SETTINGS)) {
    return errorResponse('Forbidden', 403);
  }

  const { searchParams } = new URL(req.url);
  const year = parseYearParam(searchParams.get('year'));
  const where =
    year != null
      ? {
          companyId,
          holidayDate: {
            gte: new Date(`${year}-01-01T00:00:00.000Z`),
            lte: new Date(`${year}-12-31T00:00:00.000Z`),
          },
        }
      : { companyId };

  const list = await prisma.companyHoliday.findMany({
    where,
    orderBy: [{ holidayDate: 'asc' }, { name: 'asc' }],
    include: holidayPayTypeInclude,
  });
  return successResponse(list.map(serializeCompanyHoliday));
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const payTypeLinks = resolvePayTypeLinksInput(parsed.data);
    await resolveHolidayPayTypeLinks(companyId, payTypeLinks);
    const criteria = parseCriteriaOrError(parsed.data);
    const row = await prisma.companyHoliday.create({
      data: {
        companyId,
        holidayDate: new Date(`${parsed.data.holidayDate}T00:00:00.000Z`),
        name: parsed.data.name.trim(),
        isPaid: parsed.data.isPaid ?? true,
        notes: parsed.data.notes?.trim() || null,
        ...holidayCriteriaCreateInput(criteria),
      },
      include: holidayPayTypeInclude,
    });
    await syncCompanyHolidayPayTypes(companyId, row.id, payTypeLinks);
    const refreshed = await prisma.companyHoliday.findUniqueOrThrow({
      where: { id: row.id },
      include: holidayPayTypeInclude,
    });
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'company-holiday',
      action: 'created',
    });
    return successResponse(serializeCompanyHoliday(refreshed), 201);
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'Salary structure not found or inactive' ||
        e.message === 'One or more salary structures were not found or are inactive' ||
        e.message.startsWith('Invalid workforce role type:') ||
        e.message.startsWith('Invalid visa holding:') ||
        e.message === 'Invalid holiday eligibility criteria')
    ) {
      return errorResponse(e.message, 422);
    }
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('A holiday already exists on this date', 409);
    }
    throw e;
  }
}
