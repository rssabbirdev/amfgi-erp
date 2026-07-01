import {
  checkEmployeeEmailUserConflict,
  normalizeEmployeeEmail,
  EMAIL_USER_CONFLICT_MESSAGE,
  EMAIL_LINKED_OTHER_MESSAGE,
} from '@/lib/hr/employeeEmailUserConflict';

function mockDb(users: Array<{ id: string; email: string; linkedEmployeeId: string | null }>) {
  return {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => {
        const email = where.email.toLowerCase();
        const row = users.find((u) => u.email.toLowerCase() === email);
        if (!row) return null;
        return { id: row.id, linkedEmployeeId: row.linkedEmployeeId };
      },
    },
  };
}

describe('normalizeEmployeeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmployeeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('returns null for empty', () => {
    expect(normalizeEmployeeEmail('')).toBeNull();
    expect(normalizeEmployeeEmail(null)).toBeNull();
  });
});

describe('checkEmployeeEmailUserConflict', () => {
  it('allows email when no user exists', async () => {
    const result = await checkEmployeeEmailUserConflict(mockDb([]), {
      email: 'new@example.com',
    });
    expect(result).toEqual({ ok: true });
  });

  it('blocks standalone ERP user email', async () => {
    const result = await checkEmployeeEmailUserConflict(
      mockDb([{ id: 'u1', email: 'admin@example.com', linkedEmployeeId: null }]),
      { email: 'admin@example.com', employeeId: 'emp1' }
    );
    expect(result).toEqual({
      ok: false,
      code: 'EMAIL_USER_CONFLICT',
      message: EMAIL_USER_CONFLICT_MESSAGE,
    });
  });

  it('blocks email linked to another employee', async () => {
    const result = await checkEmployeeEmailUserConflict(
      mockDb([{ id: 'u1', email: 'john@example.com', linkedEmployeeId: 'emp-other' }]),
      { email: 'john@example.com', employeeId: 'emp1' }
    );
    expect(result).toEqual({
      ok: false,
      code: 'EMAIL_LINKED_OTHER',
      message: EMAIL_LINKED_OTHER_MESSAGE,
    });
  });

  it('allows email for linked self-service account', async () => {
    const result = await checkEmployeeEmailUserConflict(
      mockDb([{ id: 'u1', email: 'john@example.com', linkedEmployeeId: 'emp1' }]),
      { email: 'john@example.com', employeeId: 'emp1', allowedUserId: 'u1' }
    );
    expect(result).toEqual({ ok: true });
  });

  it('allows when user is linked to same employee', async () => {
    const result = await checkEmployeeEmailUserConflict(
      mockDb([{ id: 'u1', email: 'john@example.com', linkedEmployeeId: 'emp1' }]),
      { email: 'john@example.com', employeeId: 'emp1' }
    );
    expect(result).toEqual({ ok: true });
  });
});
