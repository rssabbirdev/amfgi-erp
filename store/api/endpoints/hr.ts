import { appApi } from '../appApi';

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

export interface HrScheduleRow {
  id: string;
  workDate: string;
  status: 'DRAFT' | 'PUBLISHED' | 'LOCKED';
  title?: string | null;
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
  selectedDay: {
    workDate: string;
    attendanceRows: number;
    hasAttendance: boolean;
    schedule: {
      id: string;
      workDate: string;
      title: string | null;
      clientDisplayName: string | null;
      status: 'DRAFT' | 'PUBLISHED' | 'LOCKED';
      publishedAt: string | null;
      lockedAt: string | null;
      needsAttendance: boolean;
      _count: {
        assignments: number;
        absences: number;
      };
    } | null;
  };
  monthStats: {
    month: string;
    publishedScheduleDays: number;
    fulfilledScheduleDays: number;
    pendingScheduleDays: number;
    attendanceRowCount: number;
  };
  pendingSchedules: Array<{
    id: string;
    workDate: string;
    title: string | null;
    assignmentCount: number;
    attendanceRows: number;
  }>;
  previousAttendanceDays: Array<{ workDate: string; rows: number }>;
}

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

    getHrSchedules: builder.query<HrScheduleRow[], void>({
      query: () => '/hr/schedule',
      transformResponse: (r: { data: HrScheduleRow[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'WorkSchedule', id: 'LIST' }, ...result.map((schedule) => ({ type: 'WorkSchedule' as const, id: schedule.id }))]
          : [{ type: 'WorkSchedule', id: 'LIST' }],
    }),

    getHrAttendanceOverview: builder.query<HrAttendanceOverview, string>({
      query: (workDate) => `/hr/attendance/overview?workDate=${encodeURIComponent(workDate)}`,
      transformResponse: (r: { data: HrAttendanceOverview }) => r.data,
      providesTags: (result, error, workDate) => [
        { type: 'AttendanceOverview', id: workDate },
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
  useGetHrSchedulesQuery,
  useGetHrAttendanceOverviewQuery,
  useGetHrDocumentTypesQuery,
  useGetHrEmployeeTypeSettingsQuery,
  useGetHrExpertisesQuery,
} = hrApi;
