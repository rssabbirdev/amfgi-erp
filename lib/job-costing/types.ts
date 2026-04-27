export type PricingMode = 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';

export type FormulaVariableMap = Record<string, number>;

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

export type FormulaConfig = {
  version: number;
  unitSystem?: 'METRIC';
  variables?: Record<string, number | string>;
  areas: FormulaAreaRule[];
};

export type JobItemSpecificationArea = {
  measurements?: Record<string, number>;
  variables?: Record<string, number>;
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

export type JobItemMaterialEstimate = {
  materialId: string;
  materialName: string;
  baseUnit: string;
  estimatedBaseQuantity: number;
  quotedUnitCost: number;
  quotedCost: number;
  actualIssuedBaseQuantity: number;
  actualIssuedCost: number;
  quantityVariance: number;
  costVariance: number;
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
  warnings: string[];
};

export type JobCostingSummary = {
  totalQuotedMaterialCost: number;
  totalActualMaterialCost: number;
  totalEstimatedCompletionDays: number;
  comparisonMode: PricingMode;
};
