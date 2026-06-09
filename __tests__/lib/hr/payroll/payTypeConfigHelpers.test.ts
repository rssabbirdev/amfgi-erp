import { denomDaysExcludingWeekdays } from '@/lib/hr/payroll/calendar';

import { resolveOtPercent } from '@/lib/hr/payroll/payTypeConfigHelpers';



describe('payTypeConfigHelpers', () => {

  it('migrates legacy otDivisor to ot percent', () => {

    expect(resolveOtPercent({ otDivisor: 10, defaultBasicHours: 9 })).toBe(90);

  });



  it('prefers explicit otPercent', () => {

    expect(resolveOtPercent({ otPercent: 125, otDivisor: 10, defaultBasicHours: 9 })).toBe(125);

  });



  it('counts working days with selected exclusions', () => {

    expect(denomDaysExcludingWeekdays('2026-06', [0])).toBe(26);

    expect(denomDaysExcludingWeekdays('2026-06', [])).toBe(30);

    expect(denomDaysExcludingWeekdays('2026-06', [5, 6])).toBe(30 - 8);

  });

});

