import { resolveRouteEmployeeId } from '@/lib/hr/resolveRouteEmployeeId';

describe('resolveRouteEmployeeId', () => {
  it('uses params.id when present', async () => {
    const id = await resolveRouteEmployeeId(
      new Request('http://localhost/api/hr/employees/emp-1/compensation'),
      Promise.resolve({ id: 'emp-1' })
    );
    expect(id).toBe('emp-1');
  });

  it('falls back to pathname segment when params.id is missing', async () => {
    const id = await resolveRouteEmployeeId(
      new Request('http://localhost/api/hr/employees/emp-2/compensation'),
      Promise.resolve({})
    );
    expect(id).toBe('emp-2');
  });

  it('falls back for visa-periods nested route', async () => {
    const id = await resolveRouteEmployeeId(
      new Request('http://localhost/api/hr/employees/emp-3/visa-periods'),
      Promise.resolve({})
    );
    expect(id).toBe('emp-3');
  });
});
