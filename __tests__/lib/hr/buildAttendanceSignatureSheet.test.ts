import {
  buildScheduleSnapshot,
  buildSignatureSheetEntries,
  formatSignatureSheetDateLabel,
} from '@/lib/hr/buildAttendanceSignatureSheet';

const employees = [
  { id: 'e1', fullName: 'Zara Ali', preferredName: null },
  { id: 'e2', fullName: 'Ben Site', preferredName: null },
  { id: 'e3', fullName: 'Carla Factory', preferredName: null },
  { id: 'e4', fullName: 'Dan Unscheduled', preferredName: null },
];

function factoryAssignment() {
  return {
    shiftStart: '07:00',
    shiftEnd: '17:00',
    breakWindow: '12:00-13:00',
    locationType: 'FACTORY' as const,
    teamLeaderEmployeeId: null,
    driver1EmployeeId: null,
    driver2EmployeeId: null,
    members: [{ employeeId: 'e3' }],
  };
}

function siteAssignment() {
  return {
    shiftStart: '06:30',
    shiftEnd: '16:30',
    breakWindow: '11:30-12:30',
    locationType: 'SITE_JOB' as const,
    teamLeaderEmployeeId: 'e2',
    driver1EmployeeId: null,
    driver2EmployeeId: null,
    members: [],
  };
}

describe('buildScheduleSnapshot', () => {
  it('dedupes employees to their first assignment column', () => {
    const snapshot = buildScheduleSnapshot({
      absences: [],
      assignments: [
        {
          ...factoryAssignment(),
          members: [{ employeeId: 'e1' }],
        },
        {
          ...siteAssignment(),
          members: [{ employeeId: 'e1' }],
        },
      ],
    });

    expect(snapshot.assignmentByEmployee.get('e1')?.locationType).toBe('FACTORY');
  });
});

describe('buildSignatureSheetEntries', () => {
  it('marks unscheduled roster members as absent', () => {
    const entries = buildSignatureSheetEntries({
      workDateYmd: '2026-06-30',
      employees: [{ id: 'e4', fullName: 'Dan Unscheduled', preferredName: null }],
      schedule: { absences: new Set(), assignmentByEmployee: new Map() },
    });

    expect(entries[0]?.locationLabel).toBe('ABSENT');
    expect(entries[0]?.dutyIn).toBe('');
    expect(entries[0]?.noSignRequired).toBe(false);
  });

  it('marks site assignments as work at site with no sign required', () => {
    const snapshot = buildScheduleSnapshot({
      absences: [],
      assignments: [siteAssignment()],
    });
    const entries = buildSignatureSheetEntries({
      workDateYmd: '2026-06-30',
      employees: [{ id: 'e2', fullName: 'Ben Site', preferredName: null }],
      schedule: snapshot,
    });

    expect(entries[0]?.locationLabel).toBe('WORK AT SITE');
    expect(entries[0]?.noSignRequired).toBe(true);
    expect(entries[0]?.dutyIn).toBe('6:30 AM');
  });

  it('shows factory assignment times without location label', () => {
    const snapshot = buildScheduleSnapshot({
      absences: [],
      assignments: [factoryAssignment()],
    });
    const entries = buildSignatureSheetEntries({
      workDateYmd: '2026-06-30',
      employees: [{ id: 'e3', fullName: 'Carla Factory', preferredName: null }],
      schedule: snapshot,
    });

    expect(entries[0]?.locationLabel).toBe('');
    expect(entries[0]?.breakOut).toBe('12:00 PM');
    expect(entries[0]?.breakIn).toBe('1:00 PM');
    expect(entries[0]?.noSignRequired).toBe(false);
  });

  it('treats schedule absences as absent even when assigned', () => {
    const snapshot = buildScheduleSnapshot({
      absences: [{ employeeId: 'e3' }],
      assignments: [factoryAssignment()],
    });
    const entries = buildSignatureSheetEntries({
      workDateYmd: '2026-06-30',
      employees: [{ id: 'e3', fullName: 'Carla Factory', preferredName: null }],
      schedule: snapshot,
    });

    expect(entries[0]?.locationLabel).toBe('ABSENT');
    expect(entries[0]?.dutyIn).toBe('');
  });

  it('formats signature note with the work date', () => {
    expect(formatSignatureSheetDateLabel('2026-06-30')).toContain('2026');
    const entries = buildSignatureSheetEntries({
      workDateYmd: '2026-06-30',
      employees: [{ id: 'e1', fullName: 'Zara Ali', preferredName: null }],
      schedule: { absences: new Set(), assignmentByEmployee: new Map() },
    });
    expect(entries[0]?.signatureNote).toMatch(/^Sign: /);
  });
});
