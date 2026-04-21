import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

export async function getPortalEmployeeForSession(user: AppSessionUser) {
  const companyId = user.activeCompanyId;
  const id = user.linkedEmployeeId;
  if (!companyId || !id) return null;
  return prisma.employee.findFirst({
    where: { id, companyId, portalEnabled: true },
  });
}
