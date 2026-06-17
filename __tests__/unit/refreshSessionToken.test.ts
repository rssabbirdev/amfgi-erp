import { refreshAuthJwtTokenFromDb } from '@/lib/auth/refreshSessionToken';
import { P } from '@/lib/permissions';

const userId = 'user-1';
const companyId = 'company-1';
const roleId = 'role-1';

function makeDb(overrides: {
  user?: Record<string, unknown> | null;
  company?: { slug: string; name: string } | null;
  permissions?: string[];
}) {
  const user =
    overrides.user === null
      ? null
      : {
          isSuperAdmin: false,
          isActive: true,
          activeCompanyId: companyId,
          linkedEmployeeId: null,
          companyAccess: [{ companyId }],
          ...overrides.user,
        };

  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
    },
    company: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.company === null
          ? null
          : { slug: 'acme', name: 'Acme Co', ...overrides.company },
      ),
    },
    userCompanyAccess: {
      findMany: jest.fn().mockResolvedValue(
        overrides.permissions
          ? [{ role: { permissions: overrides.permissions } }]
          : [{ role: { permissions: [P.MATERIAL_VIEW] } }],
      ),
    },
  };
}

describe('refreshAuthJwtTokenFromDb', () => {
  it('replaces stale JWT permissions with current role permissions', async () => {
    const db = makeDb({ permissions: [P.JOB_VIEW] });
    const token = {
      sub: userId,
      activeCompanyId: companyId,
      permissions: [P.MATERIAL_VIEW, P.MATERIAL_EDIT],
      isSuperAdmin: false,
      allowedCompanyIds: [companyId],
    };

    const refreshed = await refreshAuthJwtTokenFromDb(db as never, token);

    expect(refreshed.permissions).toEqual([P.JOB_VIEW]);
    expect(refreshed.isSuperAdmin).toBe(false);
    expect(refreshed.allowedCompanyIds).toEqual([companyId]);
    expect(refreshed.activeCompanySlug).toBe('acme');
  });

  it('clears permissions when the account is deactivated', async () => {
    const db = makeDb({ user: { isActive: false, companyAccess: [] } });
    const token = {
      sub: userId,
      permissions: [P.MATERIAL_VIEW],
      isSuperAdmin: true,
      allowedCompanyIds: [companyId],
    };

    const refreshed = await refreshAuthJwtTokenFromDb(db as never, token);

    expect(refreshed.isActive).toBe(false);
    expect(refreshed.permissions).toEqual([]);
    expect(refreshed.isSuperAdmin).toBe(false);
    expect(refreshed.allowedCompanyIds).toEqual([]);
  });

  it('grants all permissions to super admins', async () => {
    const db = makeDb({ user: { isSuperAdmin: true } });
    const token = {
      sub: userId,
      activeCompanyId: companyId,
      permissions: [],
      isSuperAdmin: false,
    };

    const refreshed = await refreshAuthJwtTokenFromDb(db as never, token);

    expect(refreshed.isSuperAdmin).toBe(true);
    expect(refreshed.permissions?.length).toBeGreaterThan(10);
  });

  it('drops active company when access was revoked', async () => {
    const otherCompany = 'company-2';
    const db = makeDb({
      user: {
        activeCompanyId: otherCompany,
        companyAccess: [{ companyId: otherCompany }],
      },
      permissions: [P.CUSTOMER_VIEW],
    });
    const token = {
      sub: userId,
      activeCompanyId: companyId,
      permissions: [P.MATERIAL_VIEW],
    };

    const refreshed = await refreshAuthJwtTokenFromDb(db as never, token);

    expect(refreshed.activeCompanyId).toBe(otherCompany);
    expect(refreshed.permissions).toEqual([P.CUSTOMER_VIEW]);
  });
});
