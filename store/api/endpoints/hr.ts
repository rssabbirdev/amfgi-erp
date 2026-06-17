import { LIST_PAGE_SIZE_OPTIONS } from '@/lib/pagination/serverList';
import { appApi } from '../appApi';

export const HR_EMPLOYEE_PAGE_SIZE_OPTIONS = LIST_PAGE_SIZE_OPTIONS;

export type HrEmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED';

export interface HrEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  designation: string | null;
  department: string | null;
  status: HrEmployeeStatus;
  portalEnabled: boolean;
  employeeType: string;
  basicHoursPerDay: number;
  defaultTiming:
    | {
        dutyStart: string | null;
        dutyEnd: string | null;
        breakStart: string | null;
        breakEnd: string | null;
      }
    | null;
}

/** Full employee row for Excel export (all importable master fields). */
export interface HrEmployeeExportRecord {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  dateOfBirth: string | Date | null;
  gender: string | null;
  designation: string | null;
  department: string | null;
  employmentType: string | null;
  hireDate: string | Date | null;
  terminationDate: string | Date | null;
  status: HrEmployeeStatus;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bloodGroup: string | null;
  portalEnabled: boolean;
  adminNotes: string | null;
  profileExtension: unknown;
}

export interface HrScheduleRow {
  id: string;
  workDate: string;
  status: 'DRAFT' | 'PUBLISHED' | 'LOCKED';
  clientDisplayName?: string | null;
  createdAt: string;
  publishedAt: string | null;
  lockedAt: string | null;
  attendanceRows: number;
  _count: {
    assignments: number;
    absences: number;
  };
}

export interface HrAttendanceOverview {
  month: string;
  monthStats: {
    month: string;
    publishedScheduleDays: number;
    fulfilledScheduleDays: number;
    pendingScheduleDays: number;
    attendanceRowCount: number;
  };
  days: Array<{
    workDate: string | Date;
    kind: 'pending' | 'saved';
    scheduleId: string | null;
    assignmentCount: number;
    attendanceRows: number;
  }>;
}

export type HrAttendanceOverviewParams = {
  /** Calendar month to load (YYYY-MM). Defaults to current month on the server. */
  month: string;
};

export interface HrDocumentType {
  id: string;
  name: string;
  slug: string;
  requiresVisaPeriod: boolean;
  requiresExpiry: boolean;
  defaultAlertDaysBeforeExpiry: number;
  isActive: boolean;
  sortOrder: number;
}

export type HrEmployeeTypeSettings = Record<
  'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER',
  {
    basicHoursPerDay: number;
    dutyStart: string;
    dutyEnd: string;
    breakStart: string;
    breakEnd: string;
  }
>;

export interface HrExpertise {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

type HrEmployeesArg = {
  q?: string;
  status?: 'ALL' | HrEmployeeStatus;
};

export type HrEmployeesListParams = {
  limit: number;
  offset: number;
  q?: string;
  status?: 'ALL' | HrEmployeeStatus;
  employeeType?: 'ALL' | '__none__' | string;
  portal?: 'ALL' | 'enabled' | 'disabled';
};

export type HrEmployeesExportParams = Omit<HrEmployeesListParams, 'limit' | 'offset'>;

export type HrEmployeesListResponse = {
  items: HrEmployee[];
  total: number;
  employeeTypes: string[];
};

export const hrApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getHrEmployees: builder.query<HrEmployee[], HrEmployeesArg | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg?.q?.trim()) params.set('q', arg.q.trim());
        if (arg?.status && arg.status !== 'ALL') params.set('status', arg.status);
        const query = params.toString();
        return `/hr/employees${query ? `?${query}` : ''}`;
      },
      transformResponse: (r: { data: HrEmployee[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Employee', id: 'LIST' }, ...result.map((employee) => ({ type: 'Employee' as const, id: employee.id }))]
          : [{ type: 'Employee', id: 'LIST' }],
    }),

    getHrEmployeesForExport: builder.query<HrEmployeeExportRecord[], HrEmployeesExportParams | void>({
      query: (params) => {
        const search = new URLSearchParams();
        search.set('forExport', '1');
        if (params?.q?.trim()) search.set('q', params.q.trim());
        if (params?.status && params.status !== 'ALL') search.set('status', params.status);
        if (params?.employeeType && params.employeeType !== 'ALL') {
          search.set('employeeType', params.employeeType);
        }
        if (params?.portal && params.portal !== 'ALL') search.set('portal', params.portal);
        return `/hr/employees?${search.toString()}`;
      },
      transformResponse: (r: { data: HrEmployeeExportRecord[] }) => r.data,
    }),

    bulkImportEmployees: builder.mutation<
      { created: number; updated: number; skipped: number; warnings: string[] },
      { newRows: unknown[]; updateRows: unknown[] }
    >({
      query: (body) => ({
        url: '/hr/employees/import/bulk',
        method: 'POST',
        body,
      }),
      transformResponse: (r: {
        data: { created: number; updated: number; skipped: number; warnings: string[] };
      }) => r.data,
      invalidatesTags: [{ type: 'Employee', id: 'LIST' }],
    }),

    getHrEmployeesPage: builder.query<HrEmployeesListResponse, HrEmployeesListParams>({
      query: ({ limit, offset, q, status, employeeType, portal }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (q?.trim()) params.set('q', q.trim());
        if (status && status !== 'ALL') params.set('status', status);
        if (employeeType && employeeType !== 'ALL') params.set('employeeType', employeeType);
        if (portal && portal !== 'ALL') params.set('portal', portal);
        return `/hr/employees?${params.toString()}`;
      },
      transformResponse: (r: { data: HrEmployeesListResponse }) => r.data,
      providesTags: (result) =>
        result
          ? [
              { type: 'Employee', id: 'LIST' },
              ...result.items.map((employee) => ({ type: 'Employee' as const, id: employee.id })),
            ]
          : [{ type: 'Employee', id: 'LIST' }],
    }),

    getHrSchedules: builder.query<HrScheduleRow[], void>({
      query: () => '/hr/schedule',
      transformResponse: (r: { data: HrScheduleRow[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'WorkSchedule', id: 'LIST' }, ...result.map((schedule) => ({ type: 'WorkSchedule' as const, id: schedule.id }))]
          : [{ type: 'WorkSchedule', id: 'LIST' }],
    }),

    getHrSchedulesPage: builder.query<
      { items: HrScheduleRow[]; total: number },
      { limit: number; offset: number; q?: string; status?: string }
    >({
      query: ({ limit, offset, q, status }) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        if (q?.trim()) params.set('q', q.trim());
        if (status && status !== 'ALL') params.set('status', status);
        return `/hr/schedule?${params.toString()}`;
      },
      transformResponse: (r: { data: { items: HrScheduleRow[]; total: number } }) => r.data,
      providesTags: (result) =>
        result
          ? [
              { type: 'WorkSchedule', id: 'LIST' },
              ...result.items.map((schedule) => ({ type: 'WorkSchedule' as const, id: schedule.id })),
            ]
          : [{ type: 'WorkSchedule', id: 'LIST' }],
    }),

    getHrSchedulesForMonth: builder.query<HrScheduleRow[], { month: string }>({
      query: ({ month }) => `/hr/schedule?month=${encodeURIComponent(month)}`,
      transformResponse: (r: { data: HrScheduleRow[] }) => r.data,
      providesTags: (result, _error, arg) =>
        result
          ? [
              { type: 'WorkSchedule', id: `MONTH-${arg.month}` },
              ...result.map((schedule) => ({ type: 'WorkSchedule' as const, id: schedule.id })),
            ]
          : [{ type: 'WorkSchedule', id: `MONTH-${arg.month}` }],
    }),

    getHrAttendanceOverview: builder.query<HrAttendanceOverview, HrAttendanceOverviewParams>({
      query: (arg) => {
        const params = new URLSearchParams();
        params.set('month', arg.month);
        return `/hr/attendance/overview?${params.toString()}`;
      },
      transformResponse: (r: { data: HrAttendanceOverview }) => r.data,
      providesTags: (_result, _error, arg) => [
        { type: 'AttendanceOverview', id: arg.month },
        { type: 'AttendanceOverview', id: 'LIST' },
      ],
    }),

    getHrDocumentTypes: builder.query<HrDocumentType[], void>({
      query: () => '/hr/document-types',
      transformResponse: (r: { data: HrDocumentType[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'HrDocumentType', id: 'LIST' }, ...result.map((item) => ({ type: 'HrDocumentType' as const, id: item.id }))]
          : [{ type: 'HrDocumentType', id: 'LIST' }],
    }),

    getHrEmployeeTypeSettings: builder.query<HrEmployeeTypeSettings, void>({
      query: () => '/hr/employee-type-settings',
      transformResponse: (r: { data: HrEmployeeTypeSettings }) => r.data,
      providesTags: [{ type: 'HrEmployeeTypeSettings', id: 'SETTINGS' }],
    }),

    getHrExpertises: builder.query<HrExpertise[], void>({
      query: () => '/hr/expertises',
      transformResponse: (r: { data: HrExpertise[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'HrExpertise', id: 'LIST' }, ...result.map((item) => ({ type: 'HrExpertise' as const, id: item.id }))]
          : [{ type: 'HrExpertise', id: 'LIST' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetHrEmployeesQuery,
  useGetHrEmployeesPageQuery,
  useGetHrEmployeesForExportQuery,
  useLazyGetHrEmployeesForExportQuery,
  useBulkImportEmployeesMutation,
  useGetHrSchedulesQuery,
  useGetHrSchedulesPageQuery,
  useGetHrSchedulesForMonthQuery,
  useGetHrAttendanceOverviewQuery,
  useGetHrDocumentTypesQuery,
  useGetHrEmployeeTypeSettingsQuery,
  useGetHrExpertisesQuery,
} = hrApi;
