import type { Prisma, PrismaClient } from '@prisma/client';

type ExpertiseLinkRow = {
  sortOrder: number;
  expertise: {
    name: string;
  };
};

type JobWriteClient = PrismaClient | Prisma.TransactionClient;

export function normalizeRequiredExpertiseNames(input: string[] | undefined) {
  if (!input) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of input) {
    const name = String(raw ?? '').trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
  }
  return normalized;
}

export function serializeRequiredExpertises<T extends { requiredExpertiseLinks?: ExpertiseLinkRow[] }>(row: T) {
  const requiredExpertises = (row.requiredExpertiseLinks ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => entry.expertise.name);

  const nextRow = { ...row, requiredExpertises };
  delete (nextRow as { requiredExpertiseLinks?: ExpertiseLinkRow[] }).requiredExpertiseLinks;
  return nextRow;
}

export async function syncJobRequiredExpertises(
  db: JobWriteClient,
  args: {
    companyId: string;
    jobId: string;
    names: string[];
  }
) {
  const { companyId, jobId, names } = args;

  await db.jobRequiredExpertise.deleteMany({
    where: {
      companyId,
      jobId,
    },
  });

  if (names.length === 0) return;

  for (const [index, name] of names.entries()) {
    const expertise = await db.workforceExpertise.upsert({
      where: {
        companyId_name: {
          companyId,
          name,
        },
      },
      update: {
        isActive: true,
      },
      create: {
        companyId,
        name,
        isActive: true,
        sortOrder: 0,
      },
      select: {
        id: true,
      },
    });

    await db.jobRequiredExpertise.create({
      data: {
        companyId,
        jobId,
        expertiseId: expertise.id,
        sortOrder: index,
      },
    });
  }
}
