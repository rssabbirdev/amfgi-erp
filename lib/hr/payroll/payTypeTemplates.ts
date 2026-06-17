import type { PayTypeConfig } from '@/lib/hr/payroll/types';

export type PayTypeTemplateSeed = {
  name: string;
  code: string;
  isSystem: boolean;
  sortOrder: number;
  config: PayTypeConfig;
};

export const DEFAULT_PAY_TYPE_TEMPLATES: PayTypeTemplateSeed[] = [
  {
    name: 'Fixed monthly',
    code: 'OFFICE_CALENDAR_DEDUCT',
    isSystem: true,
    sortOrder: 20,
    config: {
      mode: 'MONTHLY_CALENDAR_DEDUCT',
      deductDenominator: 'WORKING_DAYS',
      excludedWeekdays: [0],
    },
  },
  {
    name: 'Daily wage (9h basic, OT 90%)',
    code: 'DAILY_WAGE_9_10',
    isSystem: true,
    sortOrder: 30,
    config: { mode: 'DAILY_WAGE', otPercent: 90 },
  },
  {
    name: 'Hourly split (basic + allowance)',
    code: 'HOURLY_SPLIT',
    isSystem: true,
    sortOrder: 40,
    config: { mode: 'HOURLY_SPLIT', excludedWeekdays: [0] },
  },
];
