import * as XLSX from 'xlsx';
import type { PrismaClient } from '@prisma/client';

import { parseReportDateBounds } from '@/lib/reports/dateRangePresets';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { parseTrackableItems } from '@/lib/job-costing/progressTracking';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export type MaterialLabelMode = 'name' | 'external';
export type JobSummaryGroupBy = 'parent' | 'variation';

export type MonthlyJobSummaryInclude = {
  consumption: boolean;
  production: boolean;
  costing: boolean;
  workHours: boolean;
};

export type MonthlyJobSummaryOptions = {
  companyId: string;
  from?: string | null;
  to?: string | null;
  jobIds?: string[];
  groupBy: JobSummaryGroupBy;
  materialLabel: MaterialLabelMode;
  include: MonthlyJobSummaryInclude;
};

export type MonthlyJobConsumptionRow = {
  materialId: string;
  materialLabel: string;
  unit: string;
  netQty: number;
  unitCost: number | null;
  netCost: number;
};

export type MonthlyJobProductionRow = {
  jobItemName: string;
  trackerLabel: string;
  unit: string | null;
  producedQty: number;
  entryCount: number;
};

export type MonthlyJobCostingSummary = {
  jobWorkValue: number | null;
  lpoValue: number | null;
  budgetMaterialCost: number | null;
  periodIssuedCost: number;
  periodReturnedCost: number;
  periodNetMaterialCost: number;
  periodReconcileCost: number;
  totalNetMaterialCostTillNow: number;
};

export type MonthlyJobWorkHoursTotal = {
  workedHours: number;
  overtimeHours: number;
};

export type MonthlyJobWorkHourRow = {
  employeeCode: string;
  employeeName: string;
  workDate: string;
  workedHours: number;
  overtimeHours: number;
};

export type MonthlyJobActivity = {
  hasStockTransactions: boolean;
  hasWorkAssignment: boolean;
};

export type MonthlyJobSheet = {
  jobId: string;
  jobNumber: string;
  customerName: string;
  site: string | null;
  parentJobNumber: string | null;
  status: string;
  activity: MonthlyJobActivity;
  consumption: MonthlyJobConsumptionRow[];
  production: MonthlyJobProductionRow[];
  costing: MonthlyJobCostingSummary | null;
  workHours: MonthlyJobWorkHourRow[];
  workHoursTotal: MonthlyJobWorkHoursTotal;
  totalNetMaterialCostTillNow: number;
  workHoursTotalTillNow: MonthlyJobWorkHoursTotal;
};

type MonthlyJobDiscovery = MonthlyJobActivity & {
  jobId: string;
};

export type MonthlyJobSummaryReport = {
  from: string | null;
  to: string | null;
  dateRangeLabel: string;
  groupBy: JobSummaryGroupBy;
  materialLabel: MaterialLabelMode;
  include: MonthlyJobSummaryInclude;
  sheets: MonthlyJobSheet[];
};

function buildDateFilter(start: Date | null, end: Date | null) {
  if (!start && !end) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (start) filter.gte = start;
  if (end) filter.lte = end;
  return filter;
}

function materialLabelFor(
  material: { name: string; externalItemName?: string | null },
  mode: MaterialLabelMode,
) {
  if (mode === 'external') {
    const external = material.externalItemName?.trim();
    return external || material.name;
  }
  return material.name;
}

type ConsumptionAccumulator = {
  materialId: string;
  materialLabel: string;
  unit: string;
  dispatchedQty: number;
  returnedQty: number;
  dispatchedCost: number;
  returnedCost: number;
};

function consumptionGroupKey(materialId: string, label: string, mode: MaterialLabelMode) {
  return mode === 'external' ? label : materialId;
}

function finalizeConsumptionRow(row: ConsumptionAccumulator): MonthlyJobConsumptionRow {
  const netQty = row.dispatchedQty - row.returnedQty;
  const netCost = row.dispatchedCost - row.returnedCost;
  return {
    materialId: row.materialId,
    materialLabel: row.materialLabel,
    unit: row.unit,
    netQty,
    unitCost: Math.abs(netQty) > 0.0005 ? netCost / netQty : null,
    netCost,
  };
}

export function aggregatePeriodConsumption(
  transactions: Array<{
    type: string;
    quantity: unknown;
    materialId: string;
    material: { name: string; externalItemName?: string | null; unit: string } | null;
    totalCost: unknown;
    batchesUsed: Array<{ costAmount: unknown }>;
  }>,
  materialLabel: MaterialLabelMode,
) {
  const grouped = new Map<string, ConsumptionAccumulator>();

  for (const txn of transactions) {
    const qty = decimalToNumberOrZero(txn.quantity);
    const cost = transactionCost(txn);
    const label = materialLabelFor(
      {
        name: txn.material?.name ?? 'Unknown',
        externalItemName: txn.material?.externalItemName,
      },
      materialLabel,
    );
    const key = consumptionGroupKey(txn.materialId, label, materialLabel);

    const row =
      grouped.get(key) ??
      ({
        materialId: materialLabel === 'external' ? `external:${label}` : txn.materialId,
        materialLabel: label,
        unit: txn.material?.unit ?? '',
        dispatchedQty: 0,
        returnedQty: 0,
        dispatchedCost: 0,
        returnedCost: 0,
      } satisfies ConsumptionAccumulator);

    if (txn.type === 'STOCK_OUT') {
      row.dispatchedQty += qty;
      row.dispatchedCost += cost;
    } else {
      row.returnedQty += qty;
      row.returnedCost += cost;
    }

    grouped.set(key, row);
  }

  const consumption = [...grouped.values()].map(finalizeConsumptionRow);
  consumption.sort((a, b) => a.materialLabel.localeCompare(b.materialLabel));
  return consumption;
}

function transactionCost(txn: {
  totalCost: unknown;
  batchesUsed: Array<{ costAmount: unknown }>;
}) {
  if (txn.batchesUsed.length > 0) {
    return txn.batchesUsed.reduce((sum, row) => sum + decimalToNumberOrZero(row.costAmount), 0);
  }
  return decimalToNumberOrZero(txn.totalCost);
}

function diffMinutes(start?: Date | null, end?: Date | null) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function workedMinutesFromAttendance(row: {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakStartAt: Date | null;
  breakEndAt: Date | null;
  overtimeMinutes: number;
}) {
  const worked = Math.max(
    0,
    diffMinutes(row.checkInAt, row.checkOutAt) - diffMinutes(row.breakStartAt, row.breakEndAt),
  );
  return {
    workedMinutes: worked,
    overtimeMinutes: Math.max(0, row.overtimeMinutes ?? 0),
  };
}

function roundHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

function sumMaterialCosts(
  transactions: Array<{
    type: string;
    totalCost: unknown;
    notes: string | null;
    batchesUsed: Array<{ costAmount: unknown }>;
  }>,
) {
  let issuedCost = 0;
  let returnedCost = 0;
  let reconcileCost = 0;

  for (const txn of transactions) {
    if (txn.type !== 'STOCK_OUT' && txn.type !== 'RETURN') continue;
    const cost = transactionCost(txn);
    if (txn.type === 'STOCK_OUT') {
      issuedCost += cost;
      if (txn.notes?.includes('Non-stock reconcile')) {
        reconcileCost += cost;
      }
    } else {
      returnedCost += cost;
    }
  }

  return {
    issuedCost,
    returnedCost,
    netMaterialCost: issuedCost - returnedCost,
    reconcileCost,
  };
}

function sumWorkHoursFromAttendance(
  rows: Array<{
    checkInAt: Date | null;
    checkOutAt: Date | null;
    breakStartAt: Date | null;
    breakEndAt: Date | null;
    overtimeMinutes: number;
  }>,
) {
  let workedMinutes = 0;
  let overtimeMinutes = 0;

  for (const row of rows) {
    const totals = workedMinutesFromAttendance(row);
    workedMinutes += totals.workedMinutes;
    overtimeMinutes += totals.overtimeMinutes;
  }

  return {
    workedHours: roundHours(workedMinutes),
    overtimeHours: roundHours(overtimeMinutes),
  };
}

async function loadJobMaterialTransactions(
  db: PrismaClient,
  companyId: string,
  consumptionJobIds: string[],
  start: Date | null,
  end: Date | null,
) {
  const dateFilter = buildDateFilter(start, end);
  return db.transaction.findMany({
    where: {
      companyId,
      jobId: { in: consumptionJobIds },
      type: { in: ['STOCK_OUT', 'RETURN'] },
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    select: {
      type: true,
      quantity: true,
      totalCost: true,
      notes: true,
      materialId: true,
      material: {
        select: {
          name: true,
          externalItemName: true,
          unit: true,
        },
      },
      batchesUsed: {
        select: { costAmount: true },
      },
    },
  });
}

async function loadJobAttendance(
  db: PrismaClient,
  companyId: string,
  consumptionJobIds: string[],
  start: Date | null,
  end: Date | null,
) {
  const dateFilter = buildDateFilter(start, end);
  return db.attendanceEntry.findMany({
    where: {
      companyId,
      ...(dateFilter ? { workDate: dateFilter } : {}),
      workAssignment: { jobId: { in: consumptionJobIds } },
    },
    select: {
      workDate: true,
      checkInAt: true,
      checkOutAt: true,
      breakStartAt: true,
      breakEndAt: true,
      overtimeMinutes: true,
      employee: {
        select: {
          employeeCode: true,
          fullName: true,
        },
      },
    },
    orderBy: [{ workDate: 'asc' }, { employee: { fullName: 'asc' } }],
  });
}

function sanitizeSheetName(name: string, used: Set<string>) {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Job';
  let candidate = cleaned.slice(0, 31);
  let counter = 1;
  while (used.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = `${cleaned.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

export async function discoverJobsInRange(
  db: PrismaClient,
  companyId: string,
  start: Date | null,
  end: Date | null,
) {
  const dateFilter = buildDateFilter(start, end);
  const byJobId = new Map<string, MonthlyJobDiscovery>();

  const mark = (jobId: string, patch: Partial<MonthlyJobActivity>) => {
    const current = byJobId.get(jobId) ?? {
      jobId,
      hasStockTransactions: false,
      hasWorkAssignment: false,
    };
    byJobId.set(jobId, {
      ...current,
      hasStockTransactions: current.hasStockTransactions || Boolean(patch.hasStockTransactions),
      hasWorkAssignment: current.hasWorkAssignment || Boolean(patch.hasWorkAssignment),
    });
  };

  const [txnJobs, assignmentJobs] = await Promise.all([
    db.transaction.findMany({
      where: {
        companyId,
        jobId: { not: null },
        type: { in: ['STOCK_OUT', 'RETURN'] },
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      select: { jobId: true },
      distinct: ['jobId'],
    }),
    db.workAssignment.findMany({
      where: {
        companyId,
        jobId: { not: null },
        workSchedule: {
          ...(dateFilter ? { workDate: dateFilter } : {}),
        },
      },
      select: { jobId: true },
      distinct: ['jobId'],
    }),
  ]);

  for (const row of txnJobs) {
    if (row.jobId) mark(row.jobId, { hasStockTransactions: true });
  }
  for (const row of assignmentJobs) {
    if (row.jobId) mark(row.jobId, { hasWorkAssignment: true });
  }

  return Array.from(byJobId.values());
}

async function resolveReportTargets(
  db: PrismaClient,
  companyId: string,
  discoveries: MonthlyJobDiscovery[],
  groupBy: JobSummaryGroupBy,
) {
  const jobIds = [...new Set(discoveries.map((row) => row.jobId))];
  if (jobIds.length === 0) return [];

  const jobs = await db.job.findMany({
    where: { companyId, id: { in: jobIds } },
    select: { id: true, parentJobId: true },
  });
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const merged = new Map<string, MonthlyJobDiscovery>();

  for (const discovery of discoveries) {
    const job = jobById.get(discovery.jobId);
    if (!job) continue;
    const reportJobId = groupBy === 'parent' ? (job.parentJobId ?? job.id) : job.id;
    const current = merged.get(reportJobId) ?? {
      jobId: reportJobId,
      hasStockTransactions: false,
      hasWorkAssignment: false,
    };
    merged.set(reportJobId, {
      jobId: reportJobId,
      hasStockTransactions: current.hasStockTransactions || discovery.hasStockTransactions,
      hasWorkAssignment: current.hasWorkAssignment || discovery.hasWorkAssignment,
    });
  }

  return Array.from(merged.values());
}

async function buildSheetForJob(
  db: PrismaClient,
  companyId: string,
  jobId: string,
  start: Date | null,
  end: Date | null,
  materialLabel: MaterialLabelMode,
  include: MonthlyJobSummaryInclude,
  activity: MonthlyJobActivity,
): Promise<MonthlyJobSheet | null> {
  const dateFilter = buildDateFilter(start, end);
  const context = await resolveJobBudgetContext(db, companyId, jobId);
  if (!context) return null;

  const job = await db.job.findFirst({
    where: { id: jobId, companyId },
    select: {
      id: true,
      jobNumber: true,
      site: true,
      status: true,
      jobWorkValue: true,
      lpoValue: true,
      customer: { select: { name: true } },
      parentJob: { select: { jobNumber: true } },
    },
  });
  if (!job) return null;

  const consumption: MonthlyJobConsumptionRow[] = [];
  const production: MonthlyJobProductionRow[] = [];
  const workHours: MonthlyJobWorkHourRow[] = [];
  let costing: MonthlyJobCostingSummary | null = null;

  const [periodTransactions, allTimeTransactions, periodAttendance, allTimeAttendance] = await Promise.all([
    include.consumption || include.costing
      ? loadJobMaterialTransactions(db, companyId, context.consumptionJobIds, start, end)
      : Promise.resolve([]),
    loadJobMaterialTransactions(db, companyId, context.consumptionJobIds, null, null),
    include.workHours
      ? loadJobAttendance(db, companyId, context.consumptionJobIds, start, end)
      : Promise.resolve([]),
    loadJobAttendance(db, companyId, context.consumptionJobIds, null, null),
  ]);

  const allTimeMaterialCosts = sumMaterialCosts(allTimeTransactions);
  const totalNetMaterialCostTillNow = allTimeMaterialCosts.netMaterialCost;
  const workHoursTotalTillNow = sumWorkHoursFromAttendance(allTimeAttendance);

  if (include.consumption || include.costing) {
    const periodMaterialCosts = sumMaterialCosts(periodTransactions);
    consumption.push(...aggregatePeriodConsumption(periodTransactions, materialLabel));

    if (include.costing) {
      const latestBudget = await db.jobCostingSnapshot.findFirst({
        where: {
          companyId,
          jobId: context.budgetJobId,
          status: 'APPROVED',
        },
        orderBy: { versionNumber: 'desc' },
        select: { totalQuotedMaterialCost: true },
      });

      costing = {
        jobWorkValue: decimalToNumberOrZero(job.jobWorkValue) || null,
        lpoValue: decimalToNumberOrZero(job.lpoValue) || null,
        budgetMaterialCost: latestBudget
          ? decimalToNumberOrZero(latestBudget.totalQuotedMaterialCost)
          : null,
        periodIssuedCost: periodMaterialCosts.issuedCost,
        periodReturnedCost: periodMaterialCosts.returnedCost,
        periodNetMaterialCost: periodMaterialCosts.netMaterialCost,
        periodReconcileCost: periodMaterialCosts.reconcileCost,
        totalNetMaterialCostTillNow,
      };
    }
  }

  if (include.production) {
    const entries = await db.jobItemProgressEntry.findMany({
      where: {
        companyId,
        ...(dateFilter ? { entryDate: dateFilter } : {}),
        jobItem: { jobId: context.budgetJobId },
      },
      select: {
        quantity: true,
        trackerId: true,
        jobItem: {
          select: {
            id: true,
            name: true,
            trackingItems: true,
            trackingUnit: true,
          },
        },
      },
    });

    const trackerCache = new Map<string, ReturnType<typeof parseTrackableItems>>();
    const grouped = new Map<string, MonthlyJobProductionRow>();

    for (const entry of entries) {
      const ji = entry.jobItem;
      const tid = entry.trackerId ? String(entry.trackerId).trim() : '';
      const key = `${ji.id}|${tid}`;

      let trackers = trackerCache.get(ji.id);
      if (!trackers) {
        trackers = parseTrackableItems(ji.trackingItems);
        trackerCache.set(ji.id, trackers);
      }
      const tracker = tid ? trackers.find((t) => t.id === tid) : null;
      const trackerLabel = tracker?.label ?? (tid || '—');
      const unit = tracker?.unit?.trim() || ji.trackingUnit?.trim() || null;

      const row =
        grouped.get(key) ??
        ({
          jobItemName: ji.name,
          trackerLabel,
          unit,
          producedQty: 0,
          entryCount: 0,
        } satisfies MonthlyJobProductionRow);

      row.producedQty += decimalToNumberOrZero(entry.quantity);
      row.entryCount += 1;
      grouped.set(key, row);
    }

    production.push(...Array.from(grouped.values()));
    production.sort(
      (a, b) =>
        a.jobItemName.localeCompare(b.jobItemName) || a.trackerLabel.localeCompare(b.trackerLabel),
    );
  }

  if (include.workHours) {
    for (const row of periodAttendance) {
      const { workedMinutes, overtimeMinutes } = workedMinutesFromAttendance(row);
      if (workedMinutes <= 0 && overtimeMinutes <= 0) continue;
      workHours.push({
        employeeCode: row.employee.employeeCode,
        employeeName: row.employee.fullName,
        workDate: row.workDate.toISOString().slice(0, 10),
        workedHours: roundHours(workedMinutes),
        overtimeHours: roundHours(overtimeMinutes),
      });
    }
  }

  const workHoursTotal = sumWorkHoursFromAttendance(
    periodAttendance.map((row) => ({
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      breakStartAt: row.breakStartAt,
      breakEndAt: row.breakEndAt,
      overtimeMinutes: row.overtimeMinutes,
    })),
  );

  return {
    jobId: job.id,
    jobNumber: job.jobNumber,
    customerName: job.customer?.name ?? '',
    site: job.site,
    parentJobNumber: job.parentJob?.jobNumber ?? null,
    status: job.status,
    activity,
    consumption,
    production,
    costing,
    workHours,
    workHoursTotal: {
      workedHours: Math.round(workHoursTotal.workedHours * 100) / 100,
      overtimeHours: Math.round(workHoursTotal.overtimeHours * 100) / 100,
    },
    totalNetMaterialCostTillNow,
    workHoursTotalTillNow: {
      workedHours: Math.round(workHoursTotalTillNow.workedHours * 100) / 100,
      overtimeHours: Math.round(workHoursTotalTillNow.overtimeHours * 100) / 100,
    },
  };
}

export async function getMonthlyJobSummaryReport(
  db: PrismaClient,
  options: MonthlyJobSummaryOptions,
): Promise<MonthlyJobSummaryReport> {
  const { start, end, label } = parseReportDateBounds(options.from, options.to);

  const rawDiscoveries =
    options.jobIds && options.jobIds.length > 0
      ? options.jobIds.map((jobId) => ({
          jobId,
          hasStockTransactions: true,
          hasWorkAssignment: true,
        }))
      : await discoverJobsInRange(db, options.companyId, start, end);

  const discoveries = await resolveReportTargets(
    db,
    options.companyId,
    rawDiscoveries,
    options.groupBy,
  );

  const sheets: MonthlyJobSheet[] = [];
  for (const discovery of discoveries) {
    const sheet = await buildSheetForJob(
      db,
      options.companyId,
      discovery.jobId,
      start,
      end,
      options.materialLabel,
      options.include,
      {
        hasStockTransactions: discovery.hasStockTransactions,
        hasWorkAssignment: discovery.hasWorkAssignment,
      },
    );
    if (sheet) sheets.push(sheet);
  }

  sheets.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));

  return {
    from: options.from?.trim() || null,
    to: options.to?.trim() || null,
    dateRangeLabel: label,
    groupBy: options.groupBy,
    materialLabel: options.materialLabel,
    include: options.include,
    sheets,
  };
}

function money(value: number | null | undefined) {
  if (value == null) return '';
  return Math.round(value * 100) / 100;
}

function qty(value: number) {
  return Math.round(value * 1000) / 1000;
}

function hasNonZeroNetQty(netQty: number) {
  return Math.abs(netQty) > 0.0005;
}

function excelConsumptionRows(rows: MonthlyJobConsumptionRow[]) {
  return rows.filter((row) => hasNonZeroNetQty(row.netQty));
}

function buildSheetRows(sheet: MonthlyJobSheet, include: MonthlyJobSummaryInclude, dateRangeLabel: string) {
  const rows: Array<Array<string | number>> = [];

  rows.push(['Job Summary']);
  rows.push(['Date range', dateRangeLabel]);
  rows.push(['Job Number', sheet.jobNumber]);
  rows.push(['Customer', sheet.customerName]);
  rows.push(['Site', sheet.site ?? '']);
  rows.push(['Status', sheet.status]);
  if (sheet.parentJobNumber) rows.push(['Parent Job', sheet.parentJobNumber]);
  rows.push([
    'Included because',
    [
      sheet.activity.hasStockTransactions ? 'Stock transactions' : null,
      sheet.activity.hasWorkAssignment ? 'Work assignment' : null,
    ]
      .filter(Boolean)
      .join(', '),
  ]);
  rows.push([]);

  if (include.consumption) {
    rows.push(['Consumption']);
    rows.push(['Material', 'Unit', 'Net Qty', 'Unit Cost', 'Net Cost']);
    const consumptionRows = excelConsumptionRows(sheet.consumption);
    if (consumptionRows.length === 0) {
      rows.push(['No consumption in this period']);
    } else {
      for (const row of consumptionRows) {
        rows.push([
          row.materialLabel,
          row.unit,
          qty(row.netQty),
          row.unitCost == null ? '' : money(row.unitCost),
          money(row.netCost),
        ]);
      }
    }
    rows.push([]);
  }

  if (include.production) {
    rows.push(['Production']);
    rows.push(['Budget Line', 'Tracker', 'Unit', 'Produced Qty', 'Entry Count']);
    if (sheet.production.length === 0) {
      rows.push(['No production logged in this period']);
    } else {
      for (const row of sheet.production) {
        rows.push([
          row.jobItemName,
          row.trackerLabel,
          row.unit ?? '',
          qty(row.producedQty),
          row.entryCount,
        ]);
      }
    }
    rows.push([]);
  }

  if (include.costing && sheet.costing) {
    rows.push(['Costing Summary']);
    rows.push(['Metric', 'Value']);
    rows.push(['Job Work Value', money(sheet.costing.jobWorkValue)]);
    rows.push(['LPO Value', money(sheet.costing.lpoValue)]);
    rows.push(['Approved Budget Material Cost', money(sheet.costing.budgetMaterialCost)]);
    rows.push(['Period Issued Material Cost', money(sheet.costing.periodIssuedCost)]);
    rows.push(['Period Returned Material Cost', money(sheet.costing.periodReturnedCost)]);
    rows.push(['Period Net Material Cost', money(sheet.costing.periodNetMaterialCost)]);
    rows.push(['Period Reconcile Cost', money(sheet.costing.periodReconcileCost)]);
    rows.push(['Total Net Material Cost Till Now', money(sheet.costing.totalNetMaterialCostTillNow)]);
    rows.push(['Total Worked Hours Till Now', sheet.workHoursTotalTillNow.workedHours]);
    rows.push(['Total Overtime Hours Till Now', sheet.workHoursTotalTillNow.overtimeHours]);
    rows.push([]);
  }

  if (include.workHours) {
    rows.push(['Work Hours']);
    rows.push(['Employee Code', 'Employee Name', 'Work Date', 'Worked Hours', 'Overtime Hours']);
    if (sheet.workHours.length === 0) {
      rows.push(['No work hours linked to this job in this period']);
    } else {
      for (const row of sheet.workHours) {
        rows.push([
          row.employeeCode,
          row.employeeName,
          row.workDate,
          row.workedHours,
          row.overtimeHours,
        ]);
      }
      rows.push([]);
      rows.push([
        'Period total',
        '',
        '',
        sheet.workHoursTotal.workedHours,
        sheet.workHoursTotal.overtimeHours,
      ]);
      rows.push([
        'Total till now',
        '',
        '',
        sheet.workHoursTotalTillNow.workedHours,
        sheet.workHoursTotalTillNow.overtimeHours,
      ]);
    }
  }

  return rows;
}

function activityLabel(activity: MonthlyJobActivity) {
  const labels: string[] = [];
  if (activity.hasStockTransactions) labels.push('Stock');
  if (activity.hasWorkAssignment) labels.push('Work assignment');
  return labels.join(' + ') || '—';
}

function excelSheetReference(sheetName: string) {
  const needsQuotes = /[\s'[\]\\/?*:]|^'|'$/.test(sheetName);
  if (!needsQuotes) return sheetName;
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function excelInternalSheetLink(sheetName: string) {
  return `#${excelSheetReference(sheetName)}!A1`;
}

function escapeExcelFormulaString(value: string) {
  return value.replace(/"/g, '""');
}

function setWorksheetHyperlink(
  worksheet: XLSX.WorkSheet,
  row: number,
  col: number,
  display: string,
  targetSheetName: string,
) {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
  const target = excelInternalSheetLink(targetSheetName);
  worksheet[cellRef] = {
    t: 's',
    v: display,
    f: `=HYPERLINK("${escapeExcelFormulaString(target)}","${escapeExcelFormulaString(display)}")`,
    l: { Target: target, Tooltip: `Open ${display}` },
  };
}

const SUMMARY_SHEET_NAME = 'Summary';

function buildSummaryIndexSheet(
  report: MonthlyJobSummaryReport,
  sheetNameByJobId: Map<string, string>,
) {
  const { include } = report;
  const headerRow: Array<string> = ['Job #', 'Customer', 'Site', 'Parent Job', 'Activity in period'];
  if (include.consumption) headerRow.push('Materials');
  if (include.costing) headerRow.push('Period net cost');
  headerRow.push('Total cost till now');
  if (include.production) headerRow.push('Production lines');
  if (include.workHours) {
    headerRow.push('Period work hours');
    headerRow.push('Work hours till now');
  }

  const rows: Array<Array<string | number>> = [
    ['Job Summary Index'],
    ['Date range', report.dateRangeLabel],
    ['Grouped by', report.groupBy === 'parent' ? 'Parent job' : 'Variation job'],
    ['Job sheets', report.sheets.length],
    [],
    headerRow,
  ];

  for (const sheet of report.sheets) {
    const row: Array<string | number> = [
      sheet.jobNumber,
      sheet.customerName,
      sheet.site ?? '',
      sheet.parentJobNumber ?? '',
      activityLabel(sheet.activity),
    ];
    if (include.consumption) row.push(excelConsumptionRows(sheet.consumption).length);
    if (include.costing) row.push(money(sheet.costing?.periodNetMaterialCost ?? 0));
    row.push(money(sheet.totalNetMaterialCostTillNow));
    if (include.production) row.push(sheet.production.length);
    if (include.workHours) {
      row.push(sheet.workHoursTotal.workedHours);
      row.push(sheet.workHoursTotalTillNow.workedHours);
    }
    rows.push(row);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const headerRowIndex = 5;

  for (let index = 0; index < report.sheets.length; index += 1) {
    const sheet = report.sheets[index]!;
    const targetSheetName = sheetNameByJobId.get(sheet.jobId);
    if (!targetSheetName) continue;
    setWorksheetHyperlink(
      worksheet,
      headerRowIndex + 1 + index,
      0,
      sheet.jobNumber,
      targetSheetName,
    );
  }

  worksheet['!cols'] = headerRow.map((label) => ({
    wch: label === 'Customer' || label === 'Site' ? 24 : label === 'Job #' ? 18 : 16,
  }));

  return worksheet;
}

export function buildMonthlyJobSummaryWorkbook(report: MonthlyJobSummaryReport) {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>([SUMMARY_SHEET_NAME]);
  const sheetNameByJobId = new Map<string, string>();

  for (const sheet of report.sheets) {
    sheetNameByJobId.set(sheet.jobId, sanitizeSheetName(sheet.jobNumber, usedNames));
  }

  const summaryWorksheet = buildSummaryIndexSheet(report, sheetNameByJobId);
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, SUMMARY_SHEET_NAME);

  for (const sheet of report.sheets) {
    const rows = buildSheetRows(sheet, report.include, report.dateRangeLabel);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sheetNameByJobId.get(sheet.jobId) ?? sanitizeSheetName(sheet.jobNumber, usedNames),
    );
  }

  return workbook;
}

export function monthlyJobSummaryFilename(from: string | null, to: string | null) {
  if (!from && !to) return 'job-summary-all-dates.xlsx';
  return `job-summary-${from || 'start'}-${to || 'end'}.xlsx`;
}

// Backward-compatible helper for tests that still pass YYYY-MM.
export function monthDateBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Invalid month, expected YYYY-MM');
  }
  const [year, monthNum] = month.split('-').map(Number);
  const start = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, monthNum, 0, 23, 59, 59, 999);
  return { start, end };
}
