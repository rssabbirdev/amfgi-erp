import { resolveWorkedMinutesFromAttendance } from '@/lib/hr/payroll/resolveWorkedMinutes';

describe('resolveWorkedMinutesFromAttendance', () => {
  it('uses punch times when available', () => {
    const checkIn = new Date('2026-06-01T09:00:00Z');
    const checkOut = new Date('2026-06-01T18:00:00Z');
    expect(
      resolveWorkedMinutesFromAttendance({
        status: 'PRESENT',
        basicHours: 9,
        checkInAt: checkIn,
        checkOutAt: checkOut,
      })
    ).toBe(540);
  });

  it('falls back to basic hours for present rows without punches', () => {
    expect(
      resolveWorkedMinutesFromAttendance({
        status: 'PRESENT',
        basicHours: 9,
        overtimeMinutes: 0,
      })
    ).toBe(540);
  });

  it('adds basic and overtime minutes when OT is recorded', () => {
    expect(
      resolveWorkedMinutesFromAttendance({
        status: 'PRESENT',
        basicHours: 9,
        overtimeMinutes: 60,
      })
    ).toBe(600);
  });

  it('returns zero for absent rows', () => {
    expect(
      resolveWorkedMinutesFromAttendance({
        status: 'ABSENT',
        basicHours: 9,
        overtimeMinutes: 0,
      })
    ).toBe(0);
  });
});
