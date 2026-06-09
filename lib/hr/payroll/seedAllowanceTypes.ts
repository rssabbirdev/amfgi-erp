import type { PrismaClient } from '@prisma/client';
import { DEFAULT_ALLOWANCE_TYPE_TEMPLATES } from '@/lib/hr/payroll/defaultAllowanceTypes';

export async function ensureDefaultAllowanceTypes(prisma: PrismaClient, companyId: string) {
  const existing = await prisma.allowanceType.count({ where: { companyId } });
  if (existing > 0) return { created: 0 };

  for (const tpl of DEFAULT_ALLOWANCE_TYPE_TEMPLATES) {
    await prisma.allowanceType.create({
      data: {
        companyId,
        name: tpl.name,
        code: tpl.code,
        description: tpl.description,
        componentKind: tpl.componentKind,
        applicationMode: tpl.applicationMode,
        sortOrder: tpl.sortOrder,
      },
    });
  }
  return { created: DEFAULT_ALLOWANCE_TYPE_TEMPLATES.length };
}
