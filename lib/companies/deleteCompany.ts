import type { Prisma, PrismaClient } from '@prisma/client';
import {
  checkCompanyDeleteEligibility,
  formatCompanyDeleteBlockMessage,
} from '@/lib/companies/checkCompanyDeleteEligibility';

type Tx = PrismaClient | Prisma.TransactionClient;

export async function deleteCompanyIfEligible(tx: Tx, companyId: string) {
  const eligibility = await checkCompanyDeleteEligibility(tx, companyId);

  if (!eligibility.canDelete) {
    throw new Error(formatCompanyDeleteBlockMessage(eligibility));
  }

  await tx.user.updateMany({
    where: { activeCompanyId: companyId },
    data: { activeCompanyId: null },
  });

  await tx.company.update({
    where: { id: companyId },
    data: { stockFallbackWarehouseId: null },
  });

  await tx.company.delete({
    where: { id: companyId },
  });
}
