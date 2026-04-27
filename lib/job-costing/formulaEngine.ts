import type {
  EmployeeExpertiseProfile,
  FormulaAreaRule,
  FormulaConfig,
  FormulaVariableMap,
  JobCostingSummary,
  JobItemCostEstimate,
  JobItemLaborEstimate,
  JobItemMaterialEstimate,
  JobItemSpecifications,
  MaterialPricingSnapshot,
  PricingMode,
} from '@/lib/job-costing/types';

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
  };
  materialCatalog: Map<string, MaterialCatalogEntry>;
  materialPricing: Map<string, MaterialPricingSnapshot>;
  materialFactorToBase: (materialId: string, quantityUomId?: string | null) => number;
  actualConsumption: Map<string, ActualConsumptionEntry>;
  teamProfiles: EmployeeExpertiseProfile[];
};

function normalizeFormulaExpression(expression: string, values: FormulaVariableMap) {
  let normalized = expression;
  for (const key of Object.keys(values).sort((a, b) => b.length - a.length)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const value = values[key];
    normalized = normalized.replace(new RegExp(escapedKey, 'g'), Number.isFinite(value) ? String(value) : '0');
  }
  return normalized;
}

function evaluateExpression(expression: string, values: FormulaVariableMap) {
  const normalized = normalizeFormulaExpression(expression, values);
  if (!/^[0-9+\-*/().,\s]*$/.test(normalized)) {
    throw new Error(`Unsafe formula expression: ${expression}`);
  }
  const result = Function(`"use strict"; return (${normalized});`)() as number;
  return Number.isFinite(result) ? result : 0;
}

function buildVariableMap(
  areaRule: FormulaAreaRule,
  specs: JobItemSpecifications,
  areaKey: string,
  formulaVariables?: Record<string, number | string>
): FormulaVariableMap {
  const globalVariables = specs.global ?? {};
  const areaSpecs = specs.areas?.[areaKey];
  const measurements = areaSpecs?.measurements ?? {};
  const areaVariables = areaSpecs?.variables ?? {};
  const ruleVariables = areaRule.variables ?? {};

  const values: FormulaVariableMap = {};
  for (const [key, value] of Object.entries(globalVariables)) {
    if (typeof value === 'number') values[`specs.global.${key}`] = value;
  }
  for (const [key, value] of Object.entries(formulaVariables ?? {})) {
    if (typeof value === 'number') values[`formula.${key}`] = value;
    if (typeof value === 'string') {
      values[`formula.${key}`] = evaluateExpression(value, values);
    }
  }
  for (const [key, value] of Object.entries(measurements)) {
    values[`area.${key}`] = value;
  }
  for (const [key, value] of Object.entries(areaVariables)) {
    values[`area.variables.${key}`] = value;
  }
  for (const [key, value] of Object.entries(ruleVariables)) {
    if (typeof value === 'number') values[`rule.${key}`] = value;
    if (typeof value === 'string') {
      values[`rule.${key}`] = evaluateExpression(value, values);
    }
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

function normalizeExpertise(value: string) {
  return value.trim().toLowerCase();
}

function resolveMaterialRuleId(
  materialRule: { materialId?: string; materialSelectorKey?: string },
  specs: JobItemSpecifications
) {
  if (materialRule.materialSelectorKey) {
    const selected = specs.global?.[materialRule.materialSelectorKey];
    return typeof selected === 'string' && selected.trim() ? selected.trim() : '';
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
      ? evaluateExpression(laborRule.quantityExpression, variables)
      : 1;
    const productivityPerWorkerPerDay = Math.max(
      evaluateExpression(laborRule.productivityPerWorkerPerDay, variables),
      0.0001
    );
    const crewSize = laborRule.crewSizeExpression
      ? Math.max(1, Math.ceil(evaluateExpression(laborRule.crewSizeExpression, variables)))
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

  for (const areaRule of formulaLibrary.formulaConfig.areas) {
    const variables = buildVariableMap(
      areaRule,
      jobItem.specifications,
      areaRule.key,
      formulaLibrary.formulaConfig.variables
    );
    for (const materialRule of areaRule.materials) {
      const materialId = resolveMaterialRuleId(materialRule, jobItem.specifications);
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

      const baseQuantityRaw = evaluateExpression(materialRule.quantityExpression, variables);
      const wasteFactor = 1 + ((materialRule.wastePercent ?? 0) / 100);
      const factorToBase = materialFactorToBase(materialId, materialRule.quantityUomId);
      const estimatedBaseQuantity = baseQuantityRaw * wasteFactor * factorToBase;
      const price = materialPricing.get(materialId);
      const actual = actualConsumption.get(materialId);
      const existing = materialTotals.get(materialId);
      const quotedUnitCost = price?.baseUnitCost ?? 0;
      const quotedCost = estimatedBaseQuantity * quotedUnitCost;
      const actualIssuedBaseQuantity = actual?.actualIssuedBaseQuantity ?? 0;
      const actualIssuedCost = actual?.actualIssuedCost ?? 0;

      materialTotals.set(materialId, {
        materialId,
        materialName: material.name,
        baseUnit: material.unit,
        estimatedBaseQuantity: (existing?.estimatedBaseQuantity ?? 0) + estimatedBaseQuantity,
        quotedUnitCost,
        quotedCost: (existing?.quotedCost ?? 0) + quotedCost,
        actualIssuedBaseQuantity,
        actualIssuedCost,
        quantityVariance: (existing?.estimatedBaseQuantity ?? 0) + estimatedBaseQuantity - actualIssuedBaseQuantity,
        costVariance: ((existing?.quotedCost ?? 0) + quotedCost) - actualIssuedCost,
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

  const materials = Array.from(materialTotals.values()).map((row) => ({
    ...row,
    quantityVariance: row.estimatedBaseQuantity - row.actualIssuedBaseQuantity,
    costVariance: row.quotedCost - row.actualIssuedCost,
  }));
  const labor = Array.from(laborTotals.values());
  const totalQuotedMaterialCost = materials.reduce((sum, row) => sum + row.quotedCost, 0);
  const totalActualMaterialCost = materials.reduce((sum, row) => sum + row.actualIssuedCost, 0);
  const estimatedCompletionDays = labor.reduce((maxDays, row) => Math.max(maxDays, row.estimatedDays), 0);

  for (const laborRow of labor) {
    if (laborRow.missingExpertises.length > 0) {
      warnings.push(`Assigned team is missing ${laborRow.missingExpertises.join(', ')} expertise.`);
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
    warnings,
  };
}

export function summarizeJobItemEstimates(items: JobItemCostEstimate[], comparisonMode: PricingMode): JobCostingSummary {
  return {
    totalQuotedMaterialCost: items.reduce((sum, item) => sum + item.totalQuotedMaterialCost, 0),
    totalActualMaterialCost: items.reduce((sum, item) => sum + item.totalActualMaterialCost, 0),
    totalEstimatedCompletionDays: items.reduce((maxDays, item) => Math.max(maxDays, item.estimatedCompletionDays), 0),
    comparisonMode,
  };
}
