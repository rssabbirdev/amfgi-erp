import type { PrismaClient } from '@prisma/client';
import { DEFAULT_PAY_TYPE_TEMPLATES } from '@/lib/hr/payroll/payTypeTemplates';

export async function ensureDefaultPayTypes(prisma: PrismaClient, companyId: string) {
  const existing = await prisma.payType.count({ where: { companyId } });
  if (existing > 0) return { created: 0 };

  for (const tpl of DEFAULT_PAY_TYPE_TEMPLATES) {
    await prisma.payType.create({
      data: {
        companyId,
        name: tpl.name,
        code: tpl.code,
        isSystem: tpl.isSystem,
        sortOrder: tpl.sortOrder,
        config: tpl.config,
      },
    });
  }
  return { created: DEFAULT_PAY_TYPE_TEMPLATES.length };
}
