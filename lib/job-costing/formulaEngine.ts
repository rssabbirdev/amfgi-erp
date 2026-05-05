import type {
  FormulaConstant,
  EmployeeExpertiseProfile,
  FormulaAreaRule,
  FormulaConfig,
  FormulaVariableMap,
  JobCostingSummary,
  JobItemCostEstimate,
  JobItemLaborEstimate,
  JobItemMaterialEstimate,
  JobItemSpecificationArea,
  JobItemSpecifications,
  MaterialPricingSnapshot,
  PricingMode,
} from '@/lib/job-costing/types';
import {
  evaluateFormulaExpression,
  evaluateNumericFormulaExpression,
  normalizeFormulaValue,
} from '@/lib/job-costing/expressionEvaluator';
import { calculateTrackedProgress, type TrackableItem } from '@/lib/job-costing/progressTracking';

type MaterialCatalogEntry = {
  id: string;
  name: string;
  unit: string;
};

type ActualConsumptionEntry = {
  materialId: string;
  actualIssuedBaseQuantity: number;
  actualIssuedCost: number;
};

type BuildEstimateArgs = {
  jobId: string;
  jobNumber: string;
  postingDate: Date;
  nonWorkingWeekdays: number[];
  pricingMode: PricingMode;
  formulaLibrary: {
    id: string;
    name: string;
    fabricationType: string;
    formulaConfig: FormulaConfig;
  };
  jobItem: {
    id: string;
    name: string;
    specifications: JobItemSpecifications;
    assignedEmployeeIds: string[];
    progressStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
    progressPercent?: number;
    trackingItems?: TrackableItem[];
    trackingEnabled?: boolean;
    trackingLabel?: string | null;
    trackingUnit?: string | null;
    trackingTargetValue?: number | null;
    trackingSourceKey?: string | null;
    plannedStartDate?: Date | null;
    plannedEndDate?: Date | null;
    actualStartDate?: Date | null;
    actualEndDate?: Date | null;
    progressNote?: string | null;
    progressEntries?: Array<{
      trackerId?: string | null;
      entryDate: Date;
      quantity: number;
    }>;
    attendanceEntries?: Array<{
      employeeId: string;
      workDate: Date;
      workedMinutes: number;
    }>;
  };
  materialCatalog: Map<string, MaterialCatalogEntry>;
  materialPricing: Map<string, MaterialPricingSnapshot>;
  materialFactorToBase: (materialId: string, quantityUomId?: string | null) => number;
  actualConsumption: Map<string, ActualConsumptionEntry>;
  teamProfiles: EmployeeExpertiseProfile[];
};

function resolveFormulaValue(value: number | string, values: FormulaVariableMap) {
  if (typeof value === 'number') return value;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  return evaluateFormulaExpression(trimmed, values);
}

function applyResolvedFormulaEntries(
  values: FormulaVariableMap,
  entries: Array<{ key: string; value: number | string }>,
  tokenPrefix: 'formula.' | 'rule.' | 'area.formula.'
) {
  const activeEntries = entries.filter((entry) => entry.key.trim());
  const maxPasses = Math.max(activeEntries.length, 1);
  const deferredKeys = new Set<string>();

  for (const entry of activeEntries) {
    const token = `${tokenPrefix}${entry.key.trim()}`;
    if (!(token in values)) values[token] = 0;
  }

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    deferredKeys.clear();

    for (const entry of activeEntries) {
      const token = `${tokenPrefix}${entry.key.trim()}`;
      try {
        const nextValue = resolveFormulaValue(entry.value, values);
        if (!Object.is(values[token], nextValue)) {
          values[token] = nextValue;
          changed = true;
        }
      } catch {
        deferredKeys.add(entry.key.trim());
      }
    }

    if (!changed && deferredKeys.size === 0) break;
  }

  for (const entry of activeEntries) {
    if (!deferredKeys.has(entry.key.trim())) continue;
    const token = `${tokenPrefix}${entry.key.trim()}`;
    values[token] = resolveFormulaValue(entry.value, values);
  }
}

/**
 * Supports canonical `{ measurements, variables }` per area and legacy flat payloads
 * (e.g. `{ area_sqm: 180 }`) still stored on older job items / seeds.
 */
function splitAreaMeasurementsAndVariables(areaSpecs: JobItemSpecificationArea | undefined): {
  measurements: Record<string, number | string | boolean>;
  variables: Record<string, number | string | boolean>;
} {
  const measurements: Record<string, number | string | boolean> = {};
  const variables: Record<string, number | string | boolean> = {};
  if (!areaSpecs || typeof areaSpecs !== 'object') {
    return { measurements, variables };
  }
  const raw = areaSpecs as Record<string, unknown>;
  const structuredMeasurements = raw.measurements;
  const structuredVariables = raw.variables;
  if (structuredMeasurements && typeof structuredMeasurements === 'object' && !Array.isArray(structuredMeasurements)) {
    for (const [key, value] of Object.entries(structuredMeasurements as Record<string, unknown>)) {
      measurements[key] = normalizeFormulaValue(value);
    }
  }
  if (structuredVariables && typeof structuredVariables === 'object' && !Array.isArray(structuredVariables)) {
    for (const [key, value] of Object.entries(structuredVariables as Record<string, unknown>)) {
      variables[key] = normalizeFormulaValue(value);
    }
  }
  const reserved = new Set(['measurements', 'variables']);
  const already = new Set([...Object.keys(measurements), ...Object.keys(variables)]);
  for (const [key, value] of Object.entries(raw)) {
    if (reserved.has(key) || already.has(key)) continue;
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) continue;
    measurements[key] = normalizeFormulaValue(value);
  }
  return { measurements, variables };
}

function buildVariableMap(
  areaRule: FormulaAreaRule,
  specs: JobItemSpecifications,
  areaKey: string,
  formulaVariables?: Record<string, number | string>,
  formulaConstants?: FormulaConstant[]
): FormulaVariableMap {
  const globalVariables = specs.global ?? {};
  const areaSpecs = specs.areas?.[areaKey];
  const { measurements, variables: areaVariables } = splitAreaMeasurementsAndVariables(areaSpecs);
  const ruleVariables = areaRule.variables ?? {};

  const values: FormulaVariableMap = {};
  for (const [key, value] of Object.entries(globalVariables)) {
    values[`specs.global.${key}`] = normalizeFormulaValue(value);
  }
  for (const [scopedAreaKey, scopedAreaSpecs] of Object.entries(specs.areas ?? {})) {
    const { measurements: scopedMeasurements, variables: scopedVariables } =
      splitAreaMeasurementsAndVariables(scopedAreaSpecs);
    for (const [key, value] of Object.entries(scopedMeasurements)) {
      values[`areas.${scopedAreaKey}.${key}`] = normalizeFormulaValue(value);
    }
    for (const [key, value] of Object.entries(scopedVariables)) {
      values[`areas.${scopedAreaKey}.${key}`] = normalizeFormulaValue(value);
    }
  }
  for (const [key, value] of Object.entries(measurements)) {
    values[`area.${key}`] = normalizeFormulaValue(value);
  }
  for (const [key, value] of Object.entries(areaVariables)) {
    values[`area.${key}`] = normalizeFormulaValue(value);
  }
  applyResolvedFormulaEntries(
    values,
    Object.entries(formulaVariables ?? {}).map(([key, value]) => ({ key, value })),
    'formula.'
  );
  applyResolvedFormulaEntries(
    values,
    (formulaConstants ?? []).map((constant) => ({ key: constant.key, value: constant.value })),
    'formula.'
  );
  applyResolvedFormulaEntries(
    values,
    Object.entries(ruleVariables).map(([key, value]) => ({ key, value })),
    'area.formula.'
  );
  for (const [key] of Object.entries(ruleVariables)) {
    values[`rule.${key}`] = values[`area.formula.${key}`];
  }
  return values;
}

function nextWorkingDate(start: Date, offsetDays: number, nonWorkingWeekdays: number[]) {
  if (offsetDays <= 0) return start.toISOString();
  const current = new Date(start);
  let remaining = Math.ceil(offsetDays);
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    if (nonWorkingWeekdays.includes(current.getDay())) continue;
    remaining -= 1;
  }
  return current.toISOString();
}

function diffCalendarDays(later: Date, earlier: Date) {
  const laterUtc = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const earlierUtc = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.round((laterUtc - earlierUtc) / 86400000);
}

function resolveIssuePaceStatus(
  expectedIssuedBaseQuantity: number,
  actualIssuedBaseQuantity: number,
  scheduleStatus: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD'
) {
  if (scheduleStatus === 'NOT_DUE' && expectedIssuedBaseQuantity <= 0) return 'NOT_DUE' as const;
  const variance = actualIssuedBaseQuantity - expectedIssuedBaseQuantity;
  const tolerance = Math.max(expectedIssuedBaseQuantity * 0.05, 0.001);
  if (variance > tolerance) return 'OVER_ISSUED' as const;
  if (variance < -tolerance) return 'UNDER_ISSUED' as const;
  return 'ON_PLAN' as const;
}

function normalizeExpertise(value: string) {
  return value.trim().toLowerCase();
}

function resolveMaterialRuleId(
  materialRule: { materialId?: string; materialSelectorKey?: string },
  specs: JobItemSpecifications,
  defaultMaterialSelections?: Record<string, string>
) {
  if (materialRule.materialSelectorKey) {
    const selected = specs.global?.[materialRule.materialSelectorKey];
    if (typeof selected === 'string' && selected.trim()) return selected.trim();
    const fallback = defaultMaterialSelections?.[materialRule.materialSelectorKey];
    return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : '';
  }
  return materialRule.materialId ?? '';
}

function buildLaborEstimate(
  areaRule: FormulaAreaRule,
  variables: FormulaVariableMap,
  assignedTeam: EmployeeExpertiseProfile[]
): JobItemLaborEstimate[] {
  return areaRule.labor.map((laborRule) => {
    const quantityBasis = laborRule.quantityExpression
      ? evaluateNumericFormulaExpression(laborRule.quantityExpression, variables)
      : 1;
    const productivityPerWorkerPerDay = Math.max(
      evaluateNumericFormulaExpression(laborRule.productivityPerWorkerPerDay, variables),
      0.0001
    );
    const crewSize = laborRule.crewSizeExpression
      ? Math.max(1, Math.ceil(evaluateNumericFormulaExpression(laborRule.crewSizeExpression, variables)))
      : 1;
    const requiredWorkers = Math.max(1, crewSize);
    const estimatedDays = quantityBasis > 0
      ? quantityBasis / (requiredWorkers * productivityPerWorkerPerDay)
      : 0;
    const expertiseKey = normalizeExpertise(laborRule.expertiseName);
    const matchingEmployees = assignedTeam.filter((employee) =>
      employee.expertises.some((expertise) => normalizeExpertise(expertise) === expertiseKey)
    );

    return {
      expertiseName: laborRule.expertiseName,
      requiredWorkers,
      estimatedDays,
      productivityPerWorkerPerDay,
      assignedEmployeeIds: matchingEmployees.map((employee) => employee.id),
      assignedEmployeeNames: matchingEmployees.map((employee) => employee.fullName),
      missingExpertises: matchingEmployees.length > 0 ? [] : [laborRule.expertiseName],
    };
  });
}

export function buildJobItemEstimate({
  postingDate,
  nonWorkingWeekdays,
  pricingMode,
  formulaLibrary,
  jobItem,
  materialCatalog,
  materialPricing,
  materialFactorToBase,
  actualConsumption,
  teamProfiles,
}: BuildEstimateArgs): JobItemCostEstimate {
  const materialTotals = new Map<string, JobItemMaterialEstimate>();
  const laborTotals = new Map<string, JobItemLaborEstimate>();
  const warnings: string[] = [];
  const tracking = calculateTrackedProgress(
    jobItem.trackingItems ?? [],
    jobItem.progressEntries ?? [],
    {
      progressStatus: jobItem.progressStatus,
      progressPercent: jobItem.progressPercent,
    },
    jobItem.attendanceEntries ?? []
  );
  const progressStatus = tracking.enabled ? tracking.derivedStatus : (jobItem.progressStatus ?? 'NOT_STARTED');
  const percentComplete = Math.max(0, Math.min(100, tracking.percentComplete));
  const plannedStartDate = jobItem.plannedStartDate ?? null;
  const plannedEndDate = jobItem.plannedEndDate ?? null;
  const actualStartDate = jobItem.actualStartDate ?? tracking.firstEntryDate ?? null;
  const actualEndDate = jobItem.actualEndDate ?? (progressStatus === 'COMPLETED' ? tracking.lastEntryDate : null);
  const provisionalScheduleStatus: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD' =
    progressStatus === 'ON_HOLD'
      ? 'ON_HOLD'
      : progressStatus === 'COMPLETED'
        ? 'COMPLETED'
        : plannedStartDate && postingDate.getTime() < plannedStartDate.getTime()
          ? 'NOT_DUE'
          : 'ON_TRACK';

  for (const areaRule of formulaLibrary.formulaConfig.areas) {
    const variables = buildVariableMap(
      areaRule,
      jobItem.specifications,
      areaRule.key,
      formulaLibrary.formulaConfig.variables,
      formulaLibrary.formulaConfig.constants
    );
    for (const materialRule of areaRule.materials) {
      const materialId = resolveMaterialRuleId(
        materialRule,
        jobItem.specifications,
        formulaLibrary.formulaConfig.defaultMaterialSelections
      );
      if (!materialId) {
        warnings.push(
          materialRule.materialSelectorKey
            ? `Select a material for ${materialRule.materialSelectorKey}.`
            : 'A formula material rule has no material selected.'
        );
        continue;
      }

      const material = materialCatalog.get(materialId);
      if (!material) {
        warnings.push(`Material ${materialId} is no longer available in this company.`);
        continue;
      }

      const baseQuantityRaw = evaluateNumericFormulaExpression(materialRule.quantityExpression, variables);
      const wasteFactor = 1 + ((materialRule.wastePercent ?? 0) / 100);
      const factorToBase = materialFactorToBase(materialId, materialRule.quantityUomId);
      const estimatedBaseQuantity = baseQuantityRaw * wasteFactor * factorToBase;
      const price = materialPricing.get(materialId);
      const actual = actualConsumption.get(materialId);
      const existing = materialTotals.get(materialId);
      const quotedUnitCost = price?.baseUnitCost ?? 0;
      const quotedCost = estimatedBaseQuantity * quotedUnitCost;
      const expectedIssuedBaseQuantity = estimatedBaseQuantity * (percentComplete / 100);
      const expectedIssuedCost = expectedIssuedBaseQuantity * quotedUnitCost;
      const actualIssuedBaseQuantity = actual?.actualIssuedBaseQuantity ?? 0;
      const actualIssuedCost = actual?.actualIssuedCost ?? 0;
      const issuePaceVariance = actualIssuedBaseQuantity - expectedIssuedBaseQuantity;
      const issuePaceStatus = resolveIssuePaceStatus(
        expectedIssuedBaseQuantity,
        actualIssuedBaseQuantity,
        provisionalScheduleStatus
      );

      materialTotals.set(materialId, {
        materialId,
        materialName: material.name,
        baseUnit: material.unit,
        estimatedBaseQuantity: (existing?.estimatedBaseQuantity ?? 0) + estimatedBaseQuantity,
        expectedIssuedBaseQuantity: (existing?.expectedIssuedBaseQuantity ?? 0) + expectedIssuedBaseQuantity,
        quotedUnitCost,
        quotedCost: (existing?.quotedCost ?? 0) + quotedCost,
        expectedIssuedCost: (existing?.expectedIssuedCost ?? 0) + expectedIssuedCost,
        actualIssuedBaseQuantity,
        actualIssuedCost,
        quantityVariance: (existing?.estimatedBaseQuantity ?? 0) + estimatedBaseQuantity - actualIssuedBaseQuantity,
        costVariance: ((existing?.quotedCost ?? 0) + quotedCost) - actualIssuedCost,
        issuePaceVariance: (existing?.issuePaceVariance ?? 0) + issuePaceVariance,
        issuePaceStatus,
        issueReconcileCompatible: true,
        pricingSource: price?.source ?? pricingMode,
      });
    }

    const laborRows = buildLaborEstimate(areaRule, variables, teamProfiles);
    for (const laborRow of laborRows) {
      const existing = laborTotals.get(laborRow.expertiseName);
      if (!existing) {
        laborTotals.set(laborRow.expertiseName, laborRow);
        continue;
      }
      laborTotals.set(laborRow.expertiseName, {
        ...existing,
        requiredWorkers: Math.max(existing.requiredWorkers, laborRow.requiredWorkers),
        estimatedDays: existing.estimatedDays + laborRow.estimatedDays,
        assignedEmployeeIds: Array.from(new Set([...existing.assignedEmployeeIds, ...laborRow.assignedEmployeeIds])),
        assignedEmployeeNames: Array.from(new Set([...existing.assignedEmployeeNames, ...laborRow.assignedEmployeeNames])),
        missingExpertises: Array.from(new Set([...existing.missingExpertises, ...laborRow.missingExpertises])),
      });
    }
  }

  let scheduleStatus: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD' = provisionalScheduleStatus;
  let varianceDays = 0;
  const materials = Array.from(materialTotals.values()).map((row) => ({
    ...row,
    quantityVariance: row.estimatedBaseQuantity - row.actualIssuedBaseQuantity,
    costVariance: row.quotedCost - row.actualIssuedCost,
    issuePaceVariance: row.actualIssuedBaseQuantity - row.expectedIssuedBaseQuantity,
    issuePaceStatus: resolveIssuePaceStatus(
      row.expectedIssuedBaseQuantity,
      row.actualIssuedBaseQuantity,
      scheduleStatus
    ),
  }));
  const labor = Array.from(laborTotals.values());
  const totalQuotedMaterialCost = materials.reduce((sum, row) => sum + row.quotedCost, 0);
  const totalActualMaterialCost = materials.reduce((sum, row) => sum + row.actualIssuedCost, 0);
  const estimatedCompletionDays = labor.reduce((maxDays, row) => Math.max(maxDays, row.estimatedDays), 0);
  const remainingFactor = Math.max(0, 1 - (percentComplete / 100));
  const forecastBaseDate = actualStartDate ?? plannedStartDate ?? postingDate;
  const forecastCompletionDate = progressStatus === 'COMPLETED'
    ? actualEndDate?.toISOString() ?? plannedEndDate?.toISOString() ?? null
    : nextWorkingDate(forecastBaseDate, estimatedCompletionDays * remainingFactor, nonWorkingWeekdays);

  if (progressStatus === 'ON_HOLD') {
    scheduleStatus = 'ON_HOLD';
  } else if (progressStatus === 'COMPLETED') {
    scheduleStatus = 'COMPLETED';
    if (plannedEndDate && actualEndDate) {
      varianceDays = diffCalendarDays(actualEndDate, plannedEndDate);
    }
  } else if (plannedStartDate && postingDate.getTime() < plannedStartDate.getTime()) {
    scheduleStatus = 'NOT_DUE';
  } else if (plannedEndDate && forecastCompletionDate) {
    varianceDays = diffCalendarDays(new Date(forecastCompletionDate), plannedEndDate);
    if (varianceDays > 0) {
      scheduleStatus = 'DELAYED';
    } else if (varianceDays === 0) {
      scheduleStatus = 'AT_RISK';
    } else {
      scheduleStatus = 'ON_TRACK';
    }
  }

  for (const laborRow of labor) {
    if (laborRow.missingExpertises.length > 0) {
      warnings.push(`Assigned team is missing ${laborRow.missingExpertises.join(', ')} expertise.`);
    }
  }

  for (const materialRow of materials) {
    if (scheduleStatus === 'DELAYED' && materialRow.issuePaceStatus === 'UNDER_ISSUED') {
      warnings.push(`${materialRow.materialName} is behind planned issue pace for a delayed scope.`);
    }
    if (scheduleStatus === 'NOT_DUE' && materialRow.issuePaceStatus === 'OVER_ISSUED') {
      warnings.push(`${materialRow.materialName} has been issued ahead of planned start timing.`);
    }
  }

  return {
    itemId: jobItem.id,
    itemName: jobItem.name,
    formulaLibraryId: formulaLibrary.id,
    formulaLibraryName: formulaLibrary.name,
    fabricationType: formulaLibrary.fabricationType,
    materials,
    labor,
    totalQuotedMaterialCost,
    totalActualMaterialCost,
    estimatedCompletionDays,
    estimatedCompletionDate: nextWorkingDate(postingDate, estimatedCompletionDays, nonWorkingWeekdays),
    progress: {
      status: progressStatus,
      scheduleStatus,
      percentComplete,
      plannedStartDate: plannedStartDate?.toISOString() ?? null,
      plannedEndDate: plannedEndDate?.toISOString() ?? null,
      actualStartDate: actualStartDate?.toISOString() ?? null,
      actualEndDate: actualEndDate?.toISOString() ?? null,
      forecastCompletionDate,
      varianceDays,
      note: jobItem.progressNote ?? null,
      remainingQuotedMaterialCost: totalQuotedMaterialCost * remainingFactor,
      remainingEstimatedDays: estimatedCompletionDays * remainingFactor,
      completedQuotedMaterialCost: totalQuotedMaterialCost * (percentComplete / 100),
      tracking: {
        enabled: tracking.enabled,
        items: tracking.items.map((item) => ({
          ...item,
          unit: item.unit ?? null,
          sourceKey: item.sourceKey ?? null,
          firstEntryDate: item.firstEntryDate?.toISOString() ?? null,
          lastEntryDate: item.lastEntryDate?.toISOString() ?? null,
        })),
        totalTargetValue: tracking.totalTargetValue,
        totalCompletedValue: tracking.totalCompletedValue,
        totalRemainingValue: tracking.totalRemainingValue,
        overallAveragePerDay: tracking.overallAveragePerDay,
        overallProjectedRemainingDays: tracking.overallProjectedRemainingDays,
        entryCount: tracking.entryCount,
        trackedDayCount: tracking.trackedDayCount,
        firstEntryDate: tracking.firstEntryDate?.toISOString() ?? null,
        lastEntryDate: tracking.lastEntryDate?.toISOString() ?? null,
        paceDenominator: tracking.paceDenominator,
        awaitingAttendanceForPace: tracking.awaitingAttendanceForPace,
        attendance: {
          workedDayCount: tracking.attendance.workedDayCount,
          totalWorkedMinutes: tracking.attendance.totalWorkedMinutes,
          totalWorkedHours: tracking.attendance.totalWorkedHours,
          uniqueWorkerCount: tracking.attendance.uniqueWorkerCount,
          averageWorkersPerDay: tracking.attendance.averageWorkersPerDay,
          lastAttendanceDate: tracking.attendance.lastAttendanceDate?.toISOString() ?? null,
        },
      },
    },
    warnings,
  };
}

/**
 * Job-level actual consumption: each line repeats full job `actualIssuedCost` per material when
 * multiple budget lines use the same material — sum across lines would double-count.
 */
function dedupeActualConsumptionAcrossItems(items: JobItemCostEstimate[]): {
  totalActualMaterialCost: number;
} {
  const actualCostByMaterial = new Map<string, number>();
  for (const item of items) {
    for (const row of item.materials) {
      const id = row.materialId;
      actualCostByMaterial.set(id, Math.max(actualCostByMaterial.get(id) ?? 0, row.actualIssuedCost));
    }
  }
  const totalActualMaterialCost = Array.from(actualCostByMaterial.values()).reduce((sum, v) => sum + v, 0);
  return { totalActualMaterialCost };
}

export function summarizeJobItemEstimates(items: JobItemCostEstimate[], comparisonMode: PricingMode): JobCostingSummary {
  const { totalActualMaterialCost } = dedupeActualConsumptionAcrossItems(items);
  return {
    totalQuotedMaterialCost: items.reduce((sum, item) => sum + item.totalQuotedMaterialCost, 0),
    totalActualMaterialCost,
    totalEstimatedCompletionDays: items.reduce((maxDays, item) => Math.max(maxDays, item.estimatedCompletionDays), 0),
    comparisonMode,
  };
}
