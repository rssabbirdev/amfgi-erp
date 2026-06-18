import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';

export type ScheduleEmployeeRow = {
  id: string;
  fullName: string;
  preferredName: string | null;
  employeeCode: string;
  status?: string | null;
  profileExtension?: unknown;
  basicHoursPerDay?: number;
  defaultTiming?: {
    dutyStart?: string;
    dutyEnd?: string;
    breakStart?: string;
    breakEnd?: string;
  } | null;
};

export type ScheduleJobRow = {
  id: string;
  jobNumber: string;
  status?: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED' | string | null;
  customerName?: string | null;
  description?: string | null;
  projectDetails?: string | null;
  quotationNumber?: string | null;
  lpoNumber?: string | null;
  site?: string | null;
  finishedGoods?: unknown;
  requiredExpertises?: unknown;
};

type ScheduleJobRowInput = ScheduleJobRow & {
  customer?: { name?: string | null } | null;
};

export function normalizeScheduleJobRow(row: ScheduleJobRowInput): ScheduleJobRow {
  return {
    ...row,
    customerName: String(row.customerName ?? row.customer?.name ?? '').trim() || null,
    status: row.status ?? null,
  };
}

export type ScheduleSearchItem = {
  id: string;
  label: string;
  searchText?: string;
};

const SEARCH_LIMIT = 25;
const HYDRATE_IDS_LIMIT = 80;

function isWorkerType(employeeType: string | undefined) {
  return employeeType === 'LABOUR_WORKER' || employeeType === 'HYBRID_STAFF';
}

function isDriverType(employeeType: string | undefined) {
  return employeeType === 'DRIVER';
}

export function toScheduleEmployee(row: ScheduleEmployeeRow) {
  return {
    ...row,
    workforce: parseWorkforceProfile(row.profileExtension),
  };
}

export function employeeToSearchItem(employee: ReturnType<typeof toScheduleEmployee>): ScheduleSearchItem {
  return {
    id: employee.id,
    label: employee.preferredName || employee.fullName,
    searchText: `${employee.fullName} ${employee.preferredName ?? ''} ${employee.employeeCode} ${employee.workforce.expertises.join(' ')}`,
  };
}

export function jobToSearchItem(job: ScheduleJobRow): ScheduleSearchItem & {
  quotationNumber: string;
  lpoNumber: string;
  companyName: string;
  siteName: string;
  status: string;
} {
  const quotationNumber = String(job.quotationNumber ?? '').trim();
  const lpoNumber = String(job.lpoNumber ?? '').trim();
  const companyName = String(job.customerName ?? '').trim();
  const siteName = String(job.site ?? '').trim();
  const status = String(job.status ?? 'ACTIVE').trim() || 'ACTIVE';
  return {
    id: job.id,
    label: job.jobNumber,
    searchText: [job.jobNumber, quotationNumber, lpoNumber, companyName, siteName, job.projectDetails ?? '', job.description ?? '']
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join(' '),
    quotationNumber,
    lpoNumber,
    companyName,
    siteName,
    status,
  };
}

async function readApiItems<T>(res: Response): Promise<T[]> {
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) return [];
  const data = json.data;
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: T[] }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}

export async function searchEmployeesApi(params: {
  q: string;
  status?: string;
  limit?: number;
}): Promise<ScheduleEmployeeRow[]> {
  const sp = new URLSearchParams({ limit: String(params.limit ?? SEARCH_LIMIT) });
  const query = params.q.trim();
  if (query) sp.set('q', query);
  if (params.status) sp.set('status', params.status);
  const res = await fetch(`/api/hr/employees?${sp.toString()}`, { cache: 'no-store' });
  return readApiItems<ScheduleEmployeeRow>(res);
}

export async function fetchEmployeesByIds(ids: string[]): Promise<ScheduleEmployeeRow[]> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, HYDRATE_IDS_LIMIT);
  if (unique.length === 0) return [];
  const sp = new URLSearchParams({ ids: unique.join(',') });
  const res = await fetch(`/api/hr/employees?${sp.toString()}`, { cache: 'no-store' });
  return readApiItems<ScheduleEmployeeRow>(res);
}

export async function fetchEmployeeById(id: string): Promise<ScheduleEmployeeRow | null> {
  if (!id) return null;
  const res = await fetch(`/api/hr/employees/${encodeURIComponent(id)}`, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) return null;
  return json.data as ScheduleEmployeeRow;
}

export async function searchJobsApi(params: {
  search: string;
  status?: string;
  /** Schedule picker uses variation jobs only (excludes parent jobs). */
  scope?: 'VARIATION_ONLY' | 'PARENT_ONLY';
  limit?: number;
}): Promise<ScheduleJobRow[]> {
  const sp = new URLSearchParams({
    limit: String(params.limit ?? SEARCH_LIMIT),
    search: params.search.trim(),
    scope: params.scope ?? 'VARIATION_ONLY',
  });
  if (params.status) sp.set('status', params.status);
  const res = await fetch(`/api/jobs?${sp.toString()}`, { cache: 'no-store' });
  const rows = await readApiItems<ScheduleJobRow>(res);
  return rows.map(normalizeScheduleJobRow);
}

/** Active employees for schedule (workers + drivers); API caps at 500 rows. */
export async function fetchActiveEmployeesForSchedule(): Promise<ReturnType<typeof toScheduleEmployee>[]> {
  const res = await fetch('/api/hr/employees?status=ACTIVE', { cache: 'no-store' });
  const rows = await readApiItems<ScheduleEmployeeRow>(res);
  return rows.map(toScheduleEmployee);
}

export async function fetchJobsByIds(ids: string[]): Promise<ScheduleJobRow[]> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, HYDRATE_IDS_LIMIT);
  if (unique.length === 0) return [];
  const sp = new URLSearchParams({ ids: unique.join(',') });
  const res = await fetch(`/api/jobs?${sp.toString()}`, { cache: 'no-store' });
  const rows = await readApiItems<ScheduleJobRow>(res);
  return rows.map(normalizeScheduleJobRow);
}

export async function fetchJobById(id: string): Promise<ScheduleJobRow | null> {
  if (!id) return null;
  const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) return null;
  return normalizeScheduleJobRow(json.data as ScheduleJobRowInput);
}

export async function activateJobApi(id: string): Promise<ScheduleJobRow> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(String(json?.error ?? 'Failed to activate job'));
  }
  return normalizeScheduleJobRow(json.data as ScheduleJobRowInput);
}

export async function searchWorkersForSchedule(q: string): Promise<ReturnType<typeof toScheduleEmployee>[]> {
  const rows = await searchEmployeesApi({ q, status: 'ACTIVE', limit: SEARCH_LIMIT });
  return rows.map(toScheduleEmployee).filter((e) => isWorkerType(e.workforce.employeeType));
}

export async function searchDriversForSchedule(q: string): Promise<ReturnType<typeof toScheduleEmployee>[]> {
  const rows = await searchEmployeesApi({ q, status: 'ACTIVE', limit: SEARCH_LIMIT });
  return rows.map(toScheduleEmployee).filter((e) => isDriverType(e.workforce.employeeType));
}
