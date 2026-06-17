import type { PrismaClient } from '@prisma/client';
import { DEFAULT_PAY_TYPE_TEMPLATES } from '@/lib/hr/payroll/payTypeTemplates';

export async function ensureDefaultPayTypes(prisma: PrismaClient, companyId: string) {
  const existing = await prisma.payType.findMany({
    where: { companyId },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((row) => row.code));

  let created = 0;
  for (const tpl of DEFAULT_PAY_TYPE_TEMPLATES) {
    if (existingCodes.has(tpl.code)) continue;
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
    created += 1;
  }
  return { created };
}
