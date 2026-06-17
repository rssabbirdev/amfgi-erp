import type { EmployeeStatus, Prisma } from '@prisma/client';

import { mergeProfileExtensionForStatusChange } from '@/lib/hr/employeeLeavePeriod';
import {
  buildWorkforceProfileExtension,
  parseWorkforceProfile,
  type WorkforceEmployeeType,
  type WorkforceVisaHolding,
} from '@/lib/hr/workforceProfile';

export type WorkforceImportPatch = {
  employeeType?: WorkforceEmployeeType;
  visaHolding?: WorkforceVisaHolding;
  expertises?: string[];
};

export function mergeWorkforceIntoProfileExtension(
  existingExtension: unknown,
  patch: WorkforceImportPatch
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...((existingExtension as Record<string, unknown> | null) ?? {}),
  };
  const current = parseWorkforceProfile(existingExtension);
  base.workforce = buildWorkforceProfileExtension({
    employeeType: patch.employeeType ?? current.employeeType,
    visaHolding: patch.visaHolding ?? current.visaHolding,
    expertises: patch.expertises ?? current.expertises,
  }).workforce;
  return base;
}

export function profileExtensionForEmployeeImport(opts: {
  existingExtension: unknown;
  previousStatus: EmployeeStatus;
  nextStatus: EmployeeStatus;
  workforcePatch: WorkforceImportPatch;
  isCreate: boolean;
}): Record<string, unknown> {
  const withWorkforce = mergeWorkforceIntoProfileExtension(
    opts.isCreate ? null : opts.existingExtension,
    opts.isCreate
      ? {
          employeeType: opts.workforcePatch.employeeType ?? 'LABOUR_WORKER',
          visaHolding: opts.workforcePatch.visaHolding ?? 'COMPANY_PROVIDED',
          expertises: opts.workforcePatch.expertises ?? [],
        }
      : opts.workforcePatch
  );
  return mergeProfileExtensionForStatusChange(
    withWorkforce,
    undefined,
    opts.previousStatus,
    opts.nextStatus
  );
}

export async function normalizeImportedExpertises(
  prisma: Pick<Prisma.TransactionClient, 'workforceExpertise'>,
  companyId: string,
  expertises: string[] | undefined
): Promise<{ expertises?: string[]; warning?: string }> {
  if (expertises === undefined) return {};
  if (expertises.length === 0) return { expertises: [] };

  const catalog = await prisma.workforceExpertise.findMany({
    where: { companyId, isActive: true },
    select: { name: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  const byLower = new Map(catalog.map((row) => [row.name.trim().toLowerCase(), row.name]));
  const normalized: string[] = [];
  const unknown: string[] = [];

  for (const value of expertises) {
    const match = byLower.get(value.trim().toLowerCase());
    if (match) normalized.push(match);
    else unknown.push(value);
  }

  if (unknown.length > 0) {
    return {
      warning: `Unknown expertise: ${unknown.join(', ')} (add in HR → Expertise catalog)`,
    };
  }

  return { expertises: [...new Set(normalized)] };
}
