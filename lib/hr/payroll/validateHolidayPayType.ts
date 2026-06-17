import { prisma } from '@/lib/db/prisma';
import {
  normalizeHolidayPayTypeLinkInput,
  type HolidayPayTypeLinkInput,
} from '@/lib/hr/payroll/holidayPayTypeLinks';

export async function resolveCompanyPayTypeId(
  companyId: string,
  payTypeId: string | null | undefined
): Promise<string | null> {
  const id = payTypeId?.trim();
  if (!id) return null;

  const payType = await prisma.payType.findFirst({
    where: { id, companyId, isActive: true },
    select: { id: true },
  });
  if (!payType) {
    throw new Error('Salary structure not found or inactive');
  }
  return payType.id;
}

export async function resolveCompanyPayTypeIds(
  companyId: string,
  payTypeIds: string[] | null | undefined
): Promise<string[]> {
  const ids = [...new Set((payTypeIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const rows = await prisma.payType.findMany({
    where: { companyId, id: { in: ids }, isActive: true },
    select: { id: true },
  });
  if (rows.length !== ids.length) {
    throw new Error('One or more salary structures were not found or are inactive');
  }
  return ids;
}

export async function resolveHolidayPayTypeLinks(
  companyId: string,
  links: HolidayPayTypeLinkInput[] | null | undefined
): Promise<ReturnType<typeof normalizeHolidayPayTypeLinkInput>[]> {
  const normalized = (links ?? []).map(normalizeHolidayPayTypeLinkInput);
  const ids = [...new Set(normalized.map((link) => link.payTypeId))];
  if (ids.length === 0) return [];
  await resolveCompanyPayTypeIds(companyId, ids);
  return normalized;
}

export async function syncCompanyHolidayPayTypes(
  companyId: string,
  companyHolidayId: string,
  links: HolidayPayTypeLinkInput[]
) {
  const validLinks = await resolveHolidayPayTypeLinks(companyId, links);
  await prisma.companyHolidayPayType.deleteMany({
    where: { companyId, companyHolidayId },
  });
  if (validLinks.length === 0) return validLinks;

  await prisma.companyHolidayPayType.createMany({
    data: validLinks.map((link) => ({
      companyId,
      companyHolidayId,
      payTypeId: link.payTypeId,
      payWorkedHoursAtOt: link.payWorkedHoursAtOt,
      holidayOtPercent: link.holidayOtPercent,
    })),
  });
  return validLinks;
}

/** @deprecated Use payTypes array with OT settings instead. */
export async function syncCompanyHolidayPayTypeIds(
  companyId: string,
  companyHolidayId: string,
  payTypeIds: string[]
) {
  return syncCompanyHolidayPayTypes(
    companyId,
    companyHolidayId,
    payTypeIds.map((payTypeId) => ({ payTypeId }))
  );
}
