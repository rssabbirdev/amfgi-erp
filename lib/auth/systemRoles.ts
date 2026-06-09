import type { Prisma, PrismaClient, Role } from '@prisma/client';
import { EMPLOYEE_SELF_ROLE_SLUG, HR_SYSTEM_ROLE_SLUG, ROLE_PRESETS } from '@/lib/permissions';

type RoleDb = PrismaClient | Prisma.TransactionClient;

export type SystemRolePreset = keyof typeof ROLE_PRESETS;

export type SystemRoleDefinition = {
  slug: string;
  name: string;
  preset: SystemRolePreset;
};

/** Global system roles created on first setup and backfilled when missing. */
export const SYSTEM_ROLE_DEFINITIONS: readonly SystemRoleDefinition[] = [
  { slug: 'admin', name: 'Admin', preset: 'super_admin' },
  { slug: 'manager', name: 'Manager', preset: 'manager' },
  { slug: 'store-keeper', name: 'Store Keeper', preset: 'store_keeper' },
  { slug: EMPLOYEE_SELF_ROLE_SLUG, name: 'Employee (self-service)', preset: 'employee_self' },
  { slug: HR_SYSTEM_ROLE_SLUG, name: 'HR', preset: 'hr' },
] as const;

export const SYSTEM_ROLE_SLUGS = SYSTEM_ROLE_DEFINITIONS.map((def) => def.slug);

export async function ensureSystemRole(db: RoleDb, slug: string): Promise<Role> {
  const def = SYSTEM_ROLE_DEFINITIONS.find((item) => item.slug === slug);
  if (!def) {
    throw new Error(`Unknown system role slug: ${slug}`);
  }

  const existing = await db.role.findFirst({ where: { slug: def.slug } });
  if (existing) return existing;

  return db.role.create({
    data: {
      name: def.name,
      slug: def.slug,
      permissions: ROLE_PRESETS[def.preset],
      isSystem: true,
    },
  });
}

export async function ensureAllSystemRoles(db: RoleDb): Promise<Record<string, Role>> {
  const bySlug: Record<string, Role> = {};
  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    bySlug[def.slug] = await ensureSystemRole(db, def.slug);
  }
  return bySlug;
}

/** Merge any permissions from ROLE_PRESETS that are missing on existing system roles. */
export async function syncSystemRolePermissionsFromPresets(db: RoleDb): Promise<void> {
  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    const role = await db.role.findFirst({ where: { slug: def.slug, isSystem: true } });
    if (!role) continue;
    const preset = ROLE_PRESETS[def.preset] as string[];
    const current = Array.isArray(role.permissions) ? (role.permissions as string[]) : [];
    const merged = [...new Set([...current, ...preset])];
    if (merged.length > current.length) {
      await db.role.update({
        where: { id: role.id },
        data: { permissions: merged },
      });
    }
  }
}

/** Creates any system roles missing from the database (safe on every request). */
export async function ensureMissingSystemRoles(db: RoleDb): Promise<void> {
  const existing = await db.role.findMany({
    where: { slug: { in: [...SYSTEM_ROLE_SLUGS] }, isSystem: true },
    select: { slug: true },
  });
  const have = new Set(existing.map((row) => row.slug));
  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    if (!have.has(def.slug)) {
      await ensureSystemRole(db, def.slug);
    }
  }
  await syncSystemRolePermissionsFromPresets(db);
}
