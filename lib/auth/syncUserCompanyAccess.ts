import type { Prisma } from '@prisma/client';

export type UserCompanyAccessInput = {
  companyId: string;
  roleId: string;
};

function accessKey(row: UserCompanyAccessInput): string {
  return `${row.companyId}:${row.roleId}`;
}

/** Drop exact duplicate company+role pairs while preserving order. */
export function dedupeUserCompanyAccess(rows: UserCompanyAccessInput[]): UserCompanyAccessInput[] {
  const seen = new Set<string>();
  const result: UserCompanyAccessInput[] = [];
  for (const row of rows) {
    const key = accessKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

/**
 * Replace a user's company/role assignments.
 * Multiple roles per company are stored as separate rows; permissions are merged at login.
 */
export async function syncUserCompanyAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  rows: UserCompanyAccessInput[]
): Promise<void> {
  const access = dedupeUserCompanyAccess(rows);

  if (access.length === 0) {
    await tx.userCompanyAccess.deleteMany({ where: { userId } });
    return;
  }

  const desired = new Set(access.map(accessKey));
  const existing = await tx.userCompanyAccess.findMany({
    where: { userId },
    select: { id: true, companyId: true, roleId: true },
  });
  const removeIds = existing.filter((row) => !desired.has(accessKey(row))).map((row) => row.id);

  if (removeIds.length > 0) {
    await tx.userCompanyAccess.deleteMany({ where: { id: { in: removeIds } } });
  }

  for (const row of access) {
    await tx.userCompanyAccess.upsert({
      where: {
        userId_companyId_roleId: { userId, companyId: row.companyId, roleId: row.roleId },
      },
      update: {},
      create: { userId, companyId: row.companyId, roleId: row.roleId },
    });
  }
}
