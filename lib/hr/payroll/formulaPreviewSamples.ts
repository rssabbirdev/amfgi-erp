import type { CompensationInput, PayLineInput } from '@/lib/hr/payroll/types';

export type FormulaPreviewScenario = {
  id: string;
  label: string;
  description: string;
  month: string;
  compensation: CompensationInput;
  lines: PayLineInput[];
};

export const FORMULA_PREVIEW_SCENARIOS: FormulaPreviewScenario[] = [
  {
    id: 'office',
    label: 'Office employee',
    description: 'Monthly 3000 AED, 1 absent day, 1 paid sick leave',
    month: '2026-06',
    compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
    lines: [
      {
        workDate: '2026-06-02',
        status: 'ABSENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 0,
        isSunday: false,
      },
      {
        workDate: '2026-06-03',
        status: 'LEAVE',
        leaveType: 'SICK',
        basicHours: 9,
        workedMinutes: 0,
        isSunday: false,
      },
      {
        workDate: '2026-06-04',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 9 * 60,
        isSunday: false,
      },
    ],
  },
  {
    id: 'daily_driver',
    label: 'Daily driver',
    description: '120 AED/day, 9h standard + 1h OT on second day',
    month: '2026-06',
    compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
    lines: [
      {
        workDate: '2026-06-01',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 9 * 60,
        isSunday: false,
      },
      {
        workDate: '2026-06-02',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 10 * 60,
        isSunday: false,
      },
      {
        workDate: '2026-06-05',
        status: 'LEAVE',
        leaveType: 'ANNUAL',
        basicHours: 9,
        workedMinutes: 0,
        isSunday: false,
      },
    ],
  },
  {
    id: 'hourly_split',
    label: 'Hourly split',
    description: '900 basic + 200 allowance, one 9h day in June',
    month: '2026-06',
    compensation: { monthlyBasic: 900, monthlyAllowance: 200, dailyRate: 0 },
    lines: [
      {
        workDate: '2026-06-01',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 9 * 60,
        isSunday: false,
      },
    ],
  },
  {
    id: 'fixed_monthly',
    label: 'Fixed monthly',
    description: 'Driver on fixed 3500 — attendance ignored',
    month: '2026-06',
    compensation: { monthlyBasic: 3500, monthlyAllowance: 0, dailyRate: 0 },
    lines: [
      {
        workDate: '2026-06-02',
        status: 'ABSENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 0,
        isSunday: false,
      },
    ],
  },
];

export function getFormulaPreviewScenario(id: string): FormulaPreviewScenario | undefined {
  return FORMULA_PREVIEW_SCENARIOS.find((s) => s.id === id);
}
