import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import {
  createCompensationPackage,
  listCompensationPackages,
} from '@/lib/hr/payroll/compensationPackages';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const AllowanceLineSchema = z.object({
  allowanceTypeId: z.string().min(1),
  amount: z.number().min(0),
});

const CreateSchema = z.object({
  payTypeId: z.string().min(1),
  monthlyBasic: z.number().min(0).optional().nullable(),
  dailyRate: z.number().min(0).optional().nullable(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional().nullable(),
  visaPeriodId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  allowances: z.array(AllowanceLineSchema).optional().default([]),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_COMPENSATION)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  const packages = await listCompensationPackages(companyId, employeeId);
  return successResponse(packages);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_COMPENSATION)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const row = await createCompensationPackage(prisma, {
      companyId,
      employeeId,
      payTypeId: parsed.data.payTypeId,
      monthlyBasic: parsed.data.monthlyBasic ?? null,
      dailyRate: parsed.data.dailyRate ?? null,
      effectiveFrom: parsed.data.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo ?? null,
      visaPeriodId: parsed.data.visaPeriodId ?? null,
      notes: parsed.data.notes ?? null,
      allowances: parsed.data.allowances,
    });

    const packages = await listCompensationPackages(companyId, employeeId);
    const created = packages.find((p) => p.id === row.id) ?? packages[0];
    return successResponse(created, 201);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Create failed', 400);
  }
}
