import type { Job, JobsListParams } from '@/store/api/endpoints/jobs';
import { jobToSearchItem, type ScheduleJobRow } from '@/lib/hr/scheduleSearchApi';

/** Shared RTK Query cache key for the schedule job picker list. */
export const SCHEDULE_JOB_PICKER_LIST_PARAMS: JobsListParams = {
  limit: 500,
  offset: 0,
  search: '',
  status: 'ALL',
  scope: 'VARIATION_ONLY',
};

export function scheduleJobPickerParams(search: string): JobsListParams {
  return {
    ...SCHEDULE_JOB_PICKER_LIST_PARAMS,
    search: search.trim(),
  };
}

export function jobRecordToScheduleRow(job: Job): ScheduleJobRow {
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    status: job.status,
    customerName: job.customerName ?? null,
    description: job.description ?? null,
    projectDetails: job.projectDetails ?? null,
    quotationNumber: job.quotationNumber ?? null,
    lpoNumber: job.lpoNumber ?? null,
    site: job.site ?? null,
    finishedGoods: 'finishedGoods' in job ? job.finishedGoods : undefined,
    requiredExpertises: job.requiredExpertises,
  };
}

export function scheduleJobToSearchItem(job: Job | ScheduleJobRow) {
  return jobToSearchItem(jobRecordToScheduleRow(job as Job));
}
