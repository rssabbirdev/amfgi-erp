export const DEFAULT_ALLOWANCE_TYPE_TEMPLATES = [
  {
    name: 'Housing',
    code: 'HOUSING',
    description: 'Accommodation allowance',
    componentKind: 'EARNING' as const,
    applicationMode: 'ATTENDANCE_PRESENT' as const,
    sortOrder: 10,
  },
  {
    name: 'Transport',
    code: 'TRANSPORT',
    description: 'Transport / fuel allowance',
    componentKind: 'EARNING' as const,
    applicationMode: 'ATTENDANCE_PRESENT' as const,
    sortOrder: 20,
  },
  {
    name: 'Food',
    code: 'FOOD',
    description: 'Meal allowance',
    componentKind: 'EARNING' as const,
    applicationMode: 'ATTENDANCE_PRESENT' as const,
    sortOrder: 30,
  },
  {
    name: 'Other',
    code: 'OTHER',
    description: 'Miscellaneous allowance',
    componentKind: 'EARNING' as const,
    applicationMode: 'ATTENDANCE_PRESENT' as const,
    sortOrder: 100,
  },
] as const;
