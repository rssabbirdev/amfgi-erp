import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';

import { P } from '@/lib/permissions';

import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';

import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';

import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

import { z } from 'zod';



const PatchSchema = z.object({

  name: z.string().min(1).max(120).optional(),

  config: z.record(z.string(), z.unknown()).optional(),

  isActive: z.boolean().optional(),

  sortOrder: z.number().int().optional(),

});



export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {

  const ctx = await requireCompanySession();

  if (!ctx.ok) return ctx.response;

  const { companyId } = ctx;

  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  const { id } = await params;



  const body = await req.json();

  const parsed = PatchSchema.safeParse(body);

  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);



  const existing = await prisma.payType.findFirst({ where: { id, companyId } });

  if (!existing) return errorResponse('Not found', 404);



  if (parsed.data.config !== undefined) {

    try {

      parsePayTypeConfig(parsed.data.config);

    } catch (error) {

      return errorResponse(error instanceof Error ? error.message : 'Invalid pay type config', 422);

    }

  }



  const row = await prisma.payType.update({

    where: { id },

    data: {

      ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),

      ...(parsed.data.config !== undefined

        ? { config: parsed.data.config as Prisma.InputJsonValue }

        : {}),

      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),

      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),

    },

  });

  return successResponse(row);

}



export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {

  const ctx = await requireCompanySession();

  if (!ctx.ok) return ctx.response;

  const { companyId } = ctx;

  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_SETTINGS)) return errorResponse('Forbidden', 403);

  const { id } = await params;



  const existing = await prisma.payType.findFirst({ where: { id, companyId } });

  if (!existing) return errorResponse('Not found', 404);



  const inUse = await prisma.employeeCompensation.count({

    where: { companyId, payTypeId: id },

  });

  if (inUse > 0) {

    return errorResponse(

      `Cannot delete: ${inUse} employee compensation record(s) use this salary structure.`,

      409

    );

  }

  const holidayLinks = await prisma.companyHolidayPayType.count({
    where: { companyId, payTypeId: id },
  });
  if (holidayLinks > 0) {
    return errorResponse(
      `Cannot delete: this salary structure is assigned to ${holidayLinks} company holiday(s).`,
      409
    );
  }



  await prisma.payType.delete({ where: { id } });

  return successResponse({ deleted: true });

}

