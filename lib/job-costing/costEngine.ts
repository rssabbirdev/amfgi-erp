import { prisma } from '@/lib/db/prisma';
import { resolveJobBudgetContext } from '@/lib/job-costing/budgetJobContext';
import { buildJobItemEstimate, summarizeJobItemEstimates } from '@/lib/job-costing/formulaEngine';
import { getFactorToBase, resolvePricingSnapshot } from '@/lib/job-costing/pricing';
import { calculateTrackedProgress, parseTrackableItems } from '@/lib/job-costing/progressTracking';
import { normalizeJobCostingSettings } from '@/lib/job-costing/settings';
import type {
  FormulaConfig,
  JobCostEngineResultPayload,
  JobItemSpecifications,
  MaterialPricingSnapshot,
  PricingMode,
} from '@/lib/job-costing/types';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mergeDefaultMaterialSelections(
  specificationSchema: unknown,
  formulaConfig: FormulaConfig
) {
  const schema = isRecord(specificationSchema) ? specificationSchema : {};
  const schemaFields = Array.isArray(schema.globalFields) ? schema.globalFields : [];
  const schemaDefaults = Object.fromEntries(
    schemaFields.flatMap((field) => {
      if (!isRecord(field) || typeof field.key !== 'string') return [];
      const materialId =
        typeof field.defaultMaterialId === 'string' && field.defaultMaterialId.trim()
          ? field.defaultMaterialId.trim()
          : '';
      return materialId ? [[field.key, materialId]] : [];
    })
  );

  return {
    ...(formulaConfig.defaultMaterialSelections ?? {}),
    ...schemaDefaults,
  };
}

function getTransactionCost(txn: {
  type: 'STOCK_OUT' | 'RETURN';
  quantity: unknown;
  totalCost: unknown;
  batchesUsed: Array<{ costAmount: unknown }>;
}) {
  const direction = txn.type === 'STOCK_OUT' ? 1 : -1;
  const cost = txn.batchesUsed.length > 0
    ? txn.batchesUsed.reduce((sum, row) => sum + decimalToNumberOrZero(row.costAmount), 0)
    : decimalToNumberOrZero(txn.totalCost);
  return { quantity: direction * decimalToNumberOrZero(txn.quantity), cost: direction * cost };
}

function diffMinutes(start?: Date | null, end?: Date | null) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function attendanceWorkedMinutesFromPunches(row: {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakStartAt: Date | null;
  breakEndAt: Date | null;
}) {
  return Math.max(0, diffMinutes(row.checkInAt, row.checkOutAt) - diffMinutes(row.breakStartAt, row.breakEndAt));
}

function getSelectedMaterialIdsFromSpecifications(specifications: JobItemSpecifications) {
  return Object.values(specifications.global ?? {}).filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
}

function resolveCurrentUnitCostFromLogs(
  materialId: string,
  fallbackUnitCost: number | null,
  postingDate: Date,
  priceLogsByMaterial: Map<string, Array<{ timestamp: Date; currentPrice: number }>>
) {
  const logs = priceLogsByMaterial.get(materialId) ?? [];
  for (const log of logs) {
    if (log.timestamp.getTime() <= postingDate.getTime()) return log.currentPrice;
  }
  return fallbackUnitCost ?? 0;
}

export async function calculateJobCostEngine(params: {
  companyId: string;
  jobId: string;
  postingDate: Date;
  pricingMode: PricingMode;
  jobItemIds?: string[];
  customUnitCosts?: Record<string, number>;
}) {
  const { companyId, jobId, postingDate, pricingMode, jobItemIds, customUnitCosts } = params;

  const ctx = await resolveJobBudgetContext(prisma, companyId, jobId);
  if (!ctx) throw new Error('Job not found');

  const [budgetJobMeta, executionJob] = await Promise.all([
    prisma.job.findFirst({
      where: { id: ctx.budgetJobId, companyId },
      select: { id: true, jobNumber: true },
    }),
    prisma.job.findFirst({
      where: { id: jobId, companyId },
      select: {
        id: true,
        jobNumber: true,
        parentJobId: true,
        executionProgressStatus: true,
        executionProgressPercent: true,
        executionPlannedStartDate: true,
        executionPlannedEndDate: true,
        executionActualStartDate: true,
        executionActualEndDate: true,
        executionProgressNote: true,
      },
    }),
  ]);
  if (!budgetJobMeta || !executionJob) throw new Error('Job not found');

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { jobCostingSettings: true },
  });

  const jobItems = await prisma.jobItem.findMany({
    where: {
      companyId,
      jobId: ctx.budgetJobId,
      isActive: true,
      ...(jobItemIds && jobItemIds.length > 0 ? { id: { in: jobItemIds } } : {}),
    },
    include: {
      assignedEmployees: {
        orderBy: { sortOrder: 'asc' },
        select: { employeeId: true, sortOrder: true },
      },
      progressEntries: {
        orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
        select: {
          trackerId: true,
          entryDate: true,
          quantity: true,
        },
      },
      formulaLibrary: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (jobItems.length === 0) throw new Error('No active job items found for this contract');

  /** Materials referenced by formulas / job item specs (budgeted scope only). */
  const budgetMaterialIds = Array.from(
    new Set(
      jobItems.flatMap((item) => {
        const config = item.formulaLibrary.formulaConfig as FormulaConfig;
        const staticMaterialIds = Array.isArray(config?.areas)
          ? config.areas.flatMap((area) =>
              area.materials.flatMap((material) => (material.materialId ? [material.materialId] : []))
            )
          : [];
        const selectedMaterialIds = getSelectedMaterialIdsFromSpecifications(
          item.specifications as JobItemSpecifications
        );
        return [...staticMaterialIds, ...selectedMaterialIds];
      })
    )
  );

  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      jobId: { in: ctx.consumptionJobIds },
      type: { in: ['STOCK_OUT', 'RETURN'] },
    },
    select: {
      materialId: true,
      type: true,
      quantity: true,
      totalCost: true,
      batchesUsed: { select: { costAmount: true } },
    },
  });

  const actualConsumption = new Map<string, { materialId: string; actualIssuedBaseQuantity: number; actualIssuedCost: number }>();
  for (const txn of transactions) {
    const current = actualConsumption.get(txn.materialId) ?? {
      materialId: txn.materialId,
      actualIssuedBaseQuantity: 0,
      actualIssuedCost: 0,
    };
    const delta = getTransactionCost(txn as typeof txn & { type: 'STOCK_OUT' | 'RETURN' });
    current.actualIssuedBaseQuantity += delta.quantity;
    current.actualIssuedCost += delta.cost;
    actualConsumption.set(txn.materialId, current);
  }

  /** Budgeted materials plus any material issued on the job (dispatch / delivery note, etc.). */
  const materialIds = Array.from(new Set([...budgetMaterialIds, ...actualConsumption.keys()]));

  const assignedEmployeeIds = Array.from(
    new Set(jobItems.flatMap((item) => item.assignedEmployees.map((entry) => entry.employeeId)))
  );

  const workAssignmentsOnJob = await prisma.workAssignment.findMany({
    where: { companyId, jobId: { in: ctx.consumptionJobIds } },
    select: {
      id: true,
      teamLeaderEmployeeId: true,
      driver1EmployeeId: true,
      driver2EmployeeId: true,
    },
  });
  const scheduleAssignmentIds = workAssignmentsOnJob.map((row) => row.id);
  const scheduleMembers =
    scheduleAssignmentIds.length > 0
      ? await prisma.workAssignmentMember.findMany({
          where: { companyId, workAssignmentId: { in: scheduleAssignmentIds } },
          select: { employeeId: true },
        })
      : [];

  const rosterEmployeeIds = Array.from(
    new Set([
      ...scheduleMembers.map((row) => row.employeeId),
      ...workAssignmentsOnJob.flatMap((row) =>
        [row.teamLeaderEmployeeId, row.driver1EmployeeId, row.driver2EmployeeId].filter((id): id is string => Boolean(id))
      ),
    ])
  );

  const attendanceEmployeeIds = Array.from(new Set([...assignedEmployeeIds, ...rosterEmployeeIds]));

  const attendanceWhere =
    attendanceEmployeeIds.length > 0
      ? {
          companyId,
          employeeId: { in: attendanceEmployeeIds },
          workDate: { lte: postingDate },
          OR: [
            {
              workAssignment: {
                is: {
                  companyId,
                  jobId: { in: ctx.consumptionJobIds },
                },
              },
            },
            { workAssignmentId: null },
          ],
        }
      : {
          companyId,
          workDate: { lte: postingDate },
          workAssignment: {
            is: {
              companyId,
              jobId: { in: ctx.consumptionJobIds },
            },
          },
        };

  const employeeIdsForProfiles = Array.from(new Set([...assignedEmployeeIds, ...rosterEmployeeIds]));

  const [materials, employees, priceLogs, attendanceEntries] = await Promise.all([
    prisma.material.findMany({
      where: {
        companyId,
        id: { in: materialIds.length > 0 ? materialIds : ['__none__'] },
      },
      include: {
        materialUoms: true,
        stockBatches: {
          where: { companyId },
          orderBy: { receivedDate: 'desc' },
        },
      },
    }),
    prisma.employee.findMany({
      where: {
        companyId,
        id: { in: employeeIdsForProfiles.length > 0 ? employeeIdsForProfiles : ['__none__'] },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        profileExtension: true,
      },
    }),
    prisma.priceLog.findMany({
      where: {
        companyId,
        materialId: { in: materialIds.length > 0 ? materialIds : ['__none__'] },
        timestamp: { lte: postingDate },
      },
      orderBy: [{ materialId: 'asc' }, { timestamp: 'desc' }],
      select: {
        materialId: true,
        currentPrice: true,
        timestamp: true,
      },
    }),
    prisma.attendanceEntry.findMany({
      where: attendanceWhere,
      orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        employeeId: true,
        workDate: true,
        checkInAt: true,
        checkOutAt: true,
        breakStartAt: true,
        breakEndAt: true,
      },
    }),
  ]);

  const priceLogsByMaterial = new Map<string, Array<{ timestamp: Date; currentPrice: number }>>();
  for (const log of priceLogs) {
    const bucket = priceLogsByMaterial.get(log.materialId) ?? [];
    bucket.push({
      timestamp: log.timestamp,
      currentPrice: decimalToNumberOrZero(log.currentPrice),
    });
    priceLogsByMaterial.set(log.materialId, bucket);
  }

  const materialCatalog = new Map(
    materials.map((material) => [
      material.id,
      { id: material.id, name: material.name, unit: material.unit },
    ])
  );

  const materialPricing = new Map<string, MaterialPricingSnapshot>();
  for (const material of materials) {
    const normalizedMaterial = {
      ...material,
      unitCost: resolveCurrentUnitCostFromLogs(
        material.id,
        material.unitCost == null ? null : decimalToNumberOrZero(material.unitCost),
        postingDate,
        priceLogsByMaterial
      ),
      stockBatches: material.stockBatches.map((batch) => ({
        ...batch,
        quantityReceived: decimalToNumberOrZero(batch.quantityReceived),
        quantityAvailable: decimalToNumberOrZero(batch.quantityAvailable),
        unitCost: decimalToNumberOrZero(batch.unitCost),
      })),
    };

    materialPricing.set(
      material.id,
      resolvePricingSnapshot(normalizedMaterial, pricingMode, customUnitCosts?.[material.id], postingDate)
    );
  }

  const employeeProfiles = new Map(
    employees.map((employee) => [
      employee.id,
      {
        id: employee.id,
        fullName: employee.fullName,
        employeeCode: employee.employeeCode,
        expertises: parseWorkforceProfile(employee.profileExtension).expertises,
      },
    ])
  );
  const attendanceByEmployee = new Map<string, Array<{ employeeId: string; workDate: Date; workedMinutes: number }>>();
  const mergedAttendanceByDay = new Map<string, { employeeId: string; workDate: Date; workedMinutes: number }>();
  for (const row of attendanceEntries) {
    const workedMinutes = attendanceWorkedMinutesFromPunches(row);
    if (workedMinutes <= 0) continue;
    const dayKey = `${row.employeeId}|${row.workDate.toISOString().slice(0, 10)}`;
    const existing = mergedAttendanceByDay.get(dayKey);
    if (!existing || workedMinutes > existing.workedMinutes) {
      mergedAttendanceByDay.set(dayKey, {
        employeeId: row.employeeId,
        workDate: row.workDate,
        workedMinutes,
      });
    }
  }
  for (const row of mergedAttendanceByDay.values()) {
    const bucket = attendanceByEmployee.get(row.employeeId) ?? [];
    bucket.push(row);
    attendanceByEmployee.set(row.employeeId, bucket);
  }

  const allJobAttendanceFlat = Array.from(mergedAttendanceByDay.values());

  const settings = normalizeJobCostingSettings(company?.jobCostingSettings);
  const execStatus = executionJob.executionProgressStatus;
  const execPercent = decimalToNumberOrZero(executionJob.executionProgressPercent);
  const execPlannedStart = executionJob.executionPlannedStartDate;
  const execPlannedEnd = executionJob.executionPlannedEndDate;
  const execActualStart = executionJob.executionActualStartDate;
  const execActualEnd = executionJob.executionActualEndDate;
  const execNote = executionJob.executionProgressNote;

  const estimates = jobItems.map((item) =>
    buildJobItemEstimate({
      jobId: budgetJobMeta.id,
      jobNumber: budgetJobMeta.jobNumber,
      postingDate,
      nonWorkingWeekdays: settings.nonWorkingWeekdays,
      pricingMode,
      formulaLibrary: {
        id: item.formulaLibrary.id,
        name: item.formulaLibrary.name,
        fabricationType: item.formulaLibrary.fabricationType,
        formulaConfig: {
          ...(item.formulaLibrary.formulaConfig as FormulaConfig),
          defaultMaterialSelections: mergeDefaultMaterialSelections(
            item.formulaLibrary.specificationSchema,
            item.formulaLibrary.formulaConfig as FormulaConfig
          ),
        },
      },
      jobItem: {
        id: item.id,
        name: item.name,
        specifications: item.specifications as JobItemSpecifications,
          assignedEmployeeIds: item.assignedEmployees.map((entry) => entry.employeeId),
          progressStatus: execStatus,
          progressPercent: execPercent,
        trackingItems: parseTrackableItems(item.trackingItems),
        trackingEnabled: item.trackingEnabled,
        trackingLabel: item.trackingLabel,
        trackingUnit: item.trackingUnit,
        trackingTargetValue: item.trackingTargetValue == null ? null : decimalToNumberOrZero(item.trackingTargetValue),
        trackingSourceKey: item.trackingSourceKey,
        plannedStartDate: execPlannedStart,
        plannedEndDate: execPlannedEnd,
        actualStartDate: execActualStart,
        actualEndDate: execActualEnd,
        progressNote: execNote,
          progressEntries: item.progressEntries.map((entry) => ({
            trackerId: entry.trackerId,
            entryDate: entry.entryDate,
            quantity: decimalToNumberOrZero(entry.quantity),
          })),
          attendanceEntries:
            item.assignedEmployees.length > 0
              ? item.assignedEmployees.flatMap((entry) => attendanceByEmployee.get(entry.employeeId) ?? [])
              : allJobAttendanceFlat,
        },
      materialCatalog,
      materialPricing,
      materialFactorToBase: (materialId, quantityUomId) => {
        const material = materials.find((entry) => entry.id === materialId);
        return material ? getFactorToBase(material, quantityUomId) : 1;
      },
      actualConsumption,
      teamProfiles: item.assignedEmployees
        .map((entry) => employeeProfiles.get(entry.employeeId))
        .filter((value): value is NonNullable<typeof value> => Boolean(value)),
    })
  );

  const jobWideRollup = calculateTrackedProgress([], [], {}, allJobAttendanceFlat);
  const attend = jobWideRollup.attendance;
  const summarized = summarizeJobItemEstimates(estimates, pricingMode);
  /** All STOCK_OUT / RETURN on the job, including materials not in any formula (dispatch extras). */
  const totalActualMaterialCostFromTransactions = Array.from(actualConsumption.values()).reduce(
    (sum, row) => sum + row.actualIssuedCost,
    0
  );
  const result: JobCostEngineResultPayload = {
    job: {
      id: budgetJobMeta.id,
      jobNumber: budgetJobMeta.jobNumber,
      variationOnly: ctx.requestedParentJobId !== null,
    },
    settings,
    items: estimates,
    summary: {
      ...summarized,
      totalActualMaterialCost: totalActualMaterialCostFromTransactions,
      jobWideAttendance: {
        workedDayCount: attend.workedDayCount,
        totalWorkedMinutes: attend.totalWorkedMinutes,
        totalWorkedHours: attend.totalWorkedHours,
        uniqueWorkerCount: attend.uniqueWorkerCount,
        averageWorkersPerDay: attend.averageWorkersPerDay,
        lastAttendanceDate: attend.lastAttendanceDate?.toISOString() ?? null,
      },
    },
    issueReconcileCompatible: estimates.every((item) =>
      item.materials.every((material) => material.issueReconcileCompatible)
    ),
    pricingSnapshots: Array.from(materialPricing.values()).sort((a, b) => a.materialName.localeCompare(b.materialName)),
  };

  return result;
}
