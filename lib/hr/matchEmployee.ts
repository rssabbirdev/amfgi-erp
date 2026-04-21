import type { PrismaClient } from '@prisma/client';

export async function findEmployeeByNameInsensitive(
  prisma: Pick<PrismaClient, 'employee'>,
  companyId: string,
  name: string
) {
  const n = name.trim();
  if (!n) return null;
  const rows = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, fullName: true },
  });
  const lower = n.toLowerCase();
  return rows.find((e) => e.fullName.trim().toLowerCase() === lower) ?? null;
}
