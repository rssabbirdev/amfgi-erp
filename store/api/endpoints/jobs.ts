import { appApi } from '../appApi';

export interface Job {
  id: string;
  companyId: string;
  externalJobId?: string;
  source?: 'LOCAL' | 'EXTERNAL_API';
  jobNumber: string;
  customerId: string;
  customerName?: string;
  description?: string;
  site?: string;
  address?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  parentJobId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  quotationNumber?: string;
  quotationDate?: string | Date;
  lpoNumber?: string;
  lpoDate?: string | Date;
  lpoValue?: number;
  projectName?: string;
  projectDetails?: string;
  contactPerson?: string;
  contactsJson?: unknown[];
  salesPerson?: string;
  requiredExpertises?: string[];
  createdBy: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

interface JobWithMaterials extends Job {
  materials?: Array<{
    materialId: string;
    materialName: string;
    unit: string;
    dispatched: number;
    returned: number;
    netConsumed: number;
    availableToReturn: number;
  }>;
}

export const jobsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getJobs: builder.query<Job[], void>({
      query: () => '/jobs',
      transformResponse: (r: { data: Job[] }) => r.data,
      providesTags: (result) =>
        result
          ? [{ type: 'Job', id: 'LIST' }, ...result.map((j) => ({ type: 'Job' as const, id: j.id }))]
          : [{ type: 'Job', id: 'LIST' }],
    }),

    getJobById: builder.query<JobWithMaterials, string>({
      query: (id) => `/jobs/${id}`,
      transformResponse: (r: { data: JobWithMaterials }) => r.data,
      providesTags: (result, error, id) => [{ type: 'Job', id }],
    }),

    getJobMaterials: builder.query<JobWithMaterials['materials'], string>({
      query: (jobId) => `/jobs/${jobId}/materials`,
      transformResponse: (r: { data: JobWithMaterials['materials'] }) => r.data,
      providesTags: (result, error, jobId) => [{ type: 'JobMaterials', id: jobId }],
    }),

    createJob: builder.mutation<Job, Partial<Job>>({
      query: (body) => ({
        url: '/jobs',
        method: 'POST',
        body,
      }),
      transformResponse: (r: { data: Job }) => r.data,
      invalidatesTags: [{ type: 'Job', id: 'LIST' }],
    }),

    updateJob: builder.mutation<Job, { id: string; data: Partial<Job> }>({
      query: ({ id, data }) => ({
        url: `/jobs/${id}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (r: { data: Job }) => r.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Job', id },
        { type: 'Job', id: 'LIST' },
      ],
    }),

    deleteJob: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({
        url: `/jobs/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (r: { deleted: boolean }) => r,
      invalidatesTags: (result, error, id) => [
        { type: 'Job', id },
        { type: 'Job', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetJobsQuery,
  useGetJobByIdQuery,
  useGetJobMaterialsQuery,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
} = jobsApi;
