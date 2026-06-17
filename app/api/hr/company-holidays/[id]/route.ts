import {
  holidayCriteriaCreateInput,
  holidayPayTypeInclude,
  serializeCompanyHoliday,
} from '@/lib/hr/payroll/companyHolidayQueries';
import { parseHolidayEmployeeCriteriaInput, normalizeHolidayEmployeeCriteria } from '@/lib/hr/payroll/holidayEmployeeEligibility';
import {
  resolveHolidayPayTypeLinks,
  syncCompanyHolidayPayTypes,
} from '@/lib/hr/payroll/validateHolidayPayType';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const HolidayPayTypeLinkSchema = z.object({
  payTypeId: z.string().min(1),
  payWorkedHoursAtOt: z.boolean().optional(),
  holidayOtPercent: z.number().int().min(1).max(500).optional().nullable(),
});

const PatchSchema = z.object({
  holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().min(1).max(160).optional(),
  isPaid: z.boolean().optional(),
  payTypes: z.array(HolidayPayTypeLinkSchema).optional(),
  /** @deprecated Use payTypes with OT settings per structure. */
  payTypeIds: z.array(z.string().min(1)).optional(),
  notes: z.string().max(2000).optional().nullable(),
  employmentTypes: z.array(z.string().min(1).max(80)).optional(),
  workforceRoleTypes: z.array(z.string().min(1).max(40)).optional(),
  visaHoldings: z.array(z.string().min(1).max(40)).optional(),
});

function resolvePayTypeLinksInput(data: {
  payTypes?: z.infer<typeof HolidayPayTypeLinkSchema>[];
  payTypeIds?: string[];
}) {
  if (data.payTypes !== undefined) return data.payTypes;
  if (data.payTypeIds !== undefined) {
    return data.payTypeIds.map((payTypeId) => ({ payTypeId }));
  }
  return undefined;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  const { id } = await params;
  const existing = await prisma.companyHoliday.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const data: Prisma.CompanyHolidayUpdateInput = {};
  if (parsed.data.holidayDate !== undefined) {
    data.holidayDate = new Date(`${parsed.data.holidayDate}T00:00:00.000Z`);
  }
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.isPaid !== undefined) data.isPaid = parsed.data.isPaid;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes?.trim() || null;

  try {
    const payTypeLinks = resolvePayTypeLinksInput(parsed.data);
    if (payTypeLinks !== undefined) {
      await resolveHolidayPayTypeLinks(companyId, payTypeLinks);
    }
    if (
      parsed.data.employmentTypes !== undefined ||
      parsed.data.workforceRoleTypes !== undefined ||
      parsed.data.visaHoldings !== undefined
    ) {
      const existingCriteria = normalizeHolidayEmployeeCriteria(existing);
      const criteria = parseHolidayEmployeeCriteriaInput({
        employmentTypes:
          parsed.data.employmentTypes !== undefined
            ? parsed.data.employmentTypes
            : existingCriteria.employmentTypes,
        workforceRoleTypes:
          parsed.data.workforceRoleTypes !== undefined
            ? parsed.data.workforceRoleTypes
            : existingCriteria.workforceRoleTypes,
        visaHoldings:
          parsed.data.visaHoldings !== undefined
            ? parsed.data.visaHoldings
            : existingCriteria.visaHoldings,
      });
      Object.assign(data, holidayCriteriaCreateInput(criteria));
    }
    await prisma.companyHoliday.update({ where: { id }, data });
    if (payTypeLinks !== undefined) {
      await syncCompanyHolidayPayTypes(companyId, id, payTypeLinks);
    }
    const row = await prisma.companyHoliday.findUniqueOrThrow({
      where: { id },
      include: holidayPayTypeInclude,
    });
    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'company-holiday',
      action: 'updated',
    });
    return successResponse(serializeCompanyHoliday(row));
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === 'Salary structure not found or inactive' ||
        e.message === 'One or more salary structures were not found or are inactive' ||
        e.message.startsWith('Invalid workforce role type:') ||
        e.message.startsWith('Invalid visa holding:'))
    ) {
      return errorResponse(e.message, 422);
    }
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('A holiday already exists on this date', 409);
    }
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  const { id } = await params;
  const existing = await prisma.companyHoliday.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  await prisma.companyHoliday.delete({ where: { id } });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'company-holiday',
    action: 'deleted',
  });
  return successResponse({ ok: true });
}
