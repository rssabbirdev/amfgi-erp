import { isEmployeeSelfServiceAccount } from '@/lib/auth/selfService';
import {
  deleteSelfServiceUser,
  DeleteSelfServiceUserError,
} from '@/lib/hr/deleteSelfServiceUser';

describe('deleteSelfServiceUser', () => {
  it('rejects non self-service users', async () => {
    const tx = {
      user: {
        findUnique: async () => ({ id: 'u1', isSuperAdmin: false, linkedEmployeeId: null }),
      },
      employee: { findUnique: async () => null, update: async () => ({}) },
    };

    await expect(deleteSelfServiceUser(tx as never, 'u1')).rejects.toMatchObject({
      code: 'NOT_SELF_SERVICE',
    });
  });

  it('clears portal access and deletes the user', async () => {
    const calls: string[] = [];
    const tx = {
      user: {
        findUnique: async () => ({ id: 'u1', isSuperAdmin: false, linkedEmployeeId: 'emp1' }),
        delete: async () => {
          calls.push('delete-user');
        },
      },
      employee: {
        findUnique: async () => ({ id: 'emp1', companyId: 'co1' }),
        update: async ({ data }: { data: { portalEnabled: boolean } }) => {
          calls.push(`portal:${data.portalEnabled}`);
        },
      },
    };

    const result = await deleteSelfServiceUser(tx as never, 'u1');
    expect(result).toEqual({ employeeId: 'emp1', companyId: 'co1' });
    expect(calls).toEqual(['portal:false', 'delete-user']);
  });
});

describe('isEmployeeSelfServiceAccount', () => {
  it('detects linked employee logins', () => {
    expect(isEmployeeSelfServiceAccount({ isSuperAdmin: false, linkedEmployeeId: 'emp1' })).toBe(
      true
    );
    expect(isEmployeeSelfServiceAccount({ isSuperAdmin: false, linkedEmployeeId: null })).toBe(
      false
    );
  });
});

describe('DeleteSelfServiceUserError', () => {
  it('exposes error code', () => {
    const err = new DeleteSelfServiceUserError('missing', 'NOT_FOUND');
    expect(err.code).toBe('NOT_FOUND');
  });
});
