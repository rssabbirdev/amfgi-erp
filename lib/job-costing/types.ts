export type PricingMode = 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';

export type FormulaVariableMap = Record<string, number | string | boolean>;

export type FormulaMaterialRule = {
  materialId?: string;
  materialSelectorKey?: string;
  quantityExpression: string;
  quantityUomId?: string | null;
  wastePercent?: number;
};

export type FormulaLaborRule = {
  expertiseName: string;
  quantityExpression?: string;
  crewSizeExpression?: string;
  productivityPerWorkerPerDay: string;
};

export type FormulaAreaRule = {
  key: string;
  label: string;
  measurementsPath?: string;
  variables?: Record<string, number | string>;
  materials: FormulaMaterialRule[];
  labor: FormulaLaborRule[];
};

export type FormulaConstant = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
};

export type FormulaConfig = {
  version: number;
  unitSystem?: 'METRIC';
  variables?: Record<string, number | string>;
  constants?: FormulaConstant[];
  defaultMaterialSelections?: Record<string, string>;
  areas: FormulaAreaRule[];
};

export type JobItemSpecificationArea = {
  measurements?: Record<string, number | string | boolean>;
  variables?: Record<string, number | string | boolean>;
};

export type JobItemSpecifications = {
  global?: Record<string, number | string>;
  areas?: Record<string, JobItemSpecificationArea>;
};

export type EmployeeExpertiseProfile = {
  id: string;
  fullName: string;
  employeeCode: string;
  expertises: string[];
};

export type MaterialPricingSnapshot = {
  materialId: string;
  materialName: string;
  baseUnit: string;
  baseUnitCost: number;
  source: 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';
};

export type JobCostingSnapshotMeta = {
  id: string;
  versionNumber: number;
  pricingMode: PricingMode;
  postingDate: string;
  totalQuotedMaterialCost: number;
  totalActualMaterialCost: number;
  totalEstimatedCompletionDays: number;
  createdAt: string;
  createdBy: string;
  note?: string | null;
};

export type JobItemMaterialEstimate = {
  materialId: string;
  materialName: string;
  baseUnit: string;
  estimatedBaseQuantity: number;
  expectedIssuedBaseQuantity: number;
  quotedUnitCost: number;
  quotedCost: number;
  expectedIssuedCost: number;
  actualIssuedBaseQuantity: number;
  actualIssuedCost: number;
  quantityVariance: number;
  costVariance: number;
  issuePaceVariance: number;
  issuePaceStatus: 'NOT_DUE' | 'ON_PLAN' | 'UNDER_ISSUED' | 'OVER_ISSUED';
  issueReconcileCompatible: boolean;
  pricingSource: MaterialPricingSnapshot['source'];
};

export type JobItemLaborEstimate = {
  expertiseName: string;
  requiredWorkers: number;
  estimatedDays: number;
  productivityPerWorkerPerDay: number;
  assignedEmployeeIds: string[];
  assignedEmployeeNames: string[];
  missingExpertises: string[];
};

export type JobItemCostEstimate = {
  itemId: string;
  itemName: string;
  formulaLibraryId: string;
  formulaLibraryName: string;
  fabricationType: string;
  materials: JobItemMaterialEstimate[];
  labor: JobItemLaborEstimate[];
  totalQuotedMaterialCost: number;
  totalActualMaterialCost: number;
  estimatedCompletionDays: number;
  estimatedCompletionDate: string | null;
  progress: {
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
    scheduleStatus: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD';
    percentComplete: number;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    actualStartDate: string | null;
    actualEndDate: string | null;
    forecastCompletionDate: string | null;
    varianceDays: number;
    note: string | null;
    remainingQuotedMaterialCost: number;
    remainingEstimatedDays: number;
    completedQuotedMaterialCost: number;
    tracking: {
      enabled: boolean;
      items: Array<{
        id: string;
        label: string;
        unit: string | null;
        targetValue: number;
        sourceKey: string | null;
        completedValue: number;
        remainingValue: number;
        percentComplete: number;
        averagePerDay: number;
        projectedRemainingDays: number | null;
        entryCount: number;
        trackedDayCount: number;
        firstEntryDate: string | null;
        lastEntryDate: string | null;
      }>;
      totalTargetValue: number;
      totalCompletedValue: number;
      totalRemainingValue: number;
      overallAveragePerDay: number;
      overallProjectedRemainingDays: number | null;
      entryCount: number;
      trackedDayCount: number;
      firstEntryDate: string | null;
      lastEntryDate: string | null;
      paceDenominator?: 'attendance_work_days' | 'progress_entry_days';
      awaitingAttendanceForPace?: boolean;
      attendance: {
        workedDayCount: number;
        totalWorkedMinutes: number;
        totalWorkedHours: number;
        uniqueWorkerCount: number;
        averageWorkersPerDay: number;
        lastAttendanceDate: string | null;
      };
    };
  };
  warnings: string[];
};

/** Deduped HR attendance for the whole job (same person/day counted once). Used for roll-up KPIs, not per-line pace. */
export type JobWideAttendanceSummary = {
  workedDayCount: number;
  totalWorkedMinutes: number;
  totalWorkedHours: number;
  uniqueWorkerCount: number;
  averageWorkersPerDay: number;
  lastAttendanceDate: string | null;
};

export type JobCostingSummary = {
  totalQuotedMaterialCost: number;
  totalActualMaterialCost: number;
  totalEstimatedCompletionDays: number;
  comparisonMode: PricingMode;
  /** Present on new cost-engine runs; absent on older saved snapshots. */
  jobWideAttendance?: JobWideAttendanceSummary;
};

export type JobCostEngineResultPayload = {
  job: {
    id: string;
    jobNumber: string;
    variationOnly: boolean;
  };
  settings: {
    nonWorkingWeekdays: number[];
  };
  items: JobItemCostEstimate[];
  summary: JobCostingSummary;
  issueReconcileCompatible: boolean;
  pricingSnapshots: MaterialPricingSnapshot[];
};
