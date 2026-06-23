import { buildJobItemEstimate } from '@/lib/job-costing/formulaEngine';
import { buildManualJobItemEstimate } from '@/lib/job-costing/manualJobItemEstimate';
import { isManualBudgetSpecifications } from '@/lib/job-costing/manualBudget';
import type {
  EmployeeExpertiseProfile,
  FormulaConfig,
  JobItemSpecifications,
  MaterialPricingSnapshot,
  PricingMode,
} from '@/lib/job-costing/types';
import type { TrackableItem } from '@/lib/job-costing/progressTracking';

type StoredJobItemEstimateArgs = {
  jobId: string;
  jobNumber: string;
  postingDate: Date;
  nonWorkingWeekdays: number[];
  pricingMode: PricingMode;
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
  formulaLibrary: {
    id: string;
    name: string;
    fabricationType: string;
    formulaConfig: FormulaConfig;
    specificationSchema?: unknown;
  } | null;
  materialCatalog: Map<string, { id: string; name: string; unit: string }>;
  materialPricing: Map<string, MaterialPricingSnapshot>;
  materialFactorToBase: (materialId: string, quantityUomId?: string | null) => number;
  actualConsumption: Map<string, { materialId: string; actualIssuedBaseQuantity: number; actualIssuedCost: number }>;
  teamProfiles: EmployeeExpertiseProfile[];
};

export function buildStoredJobItemEstimate(args: StoredJobItemEstimateArgs) {
  if (isManualBudgetSpecifications(args.jobItem.specifications) || !args.formulaLibrary) {
    return buildManualJobItemEstimate({
      postingDate: args.postingDate,
      nonWorkingWeekdays: args.nonWorkingWeekdays,
      pricingMode: args.pricingMode,
      jobItem: args.jobItem,
      materialCatalog: args.materialCatalog,
      materialPricing: args.materialPricing,
      materialFactorToBase: args.materialFactorToBase,
      actualConsumption: args.actualConsumption,
      teamProfiles: args.teamProfiles,
    });
  }

  return buildJobItemEstimate({
    jobId: args.jobId,
    jobNumber: args.jobNumber,
    pricingMode: args.pricingMode,
    postingDate: args.postingDate,
    nonWorkingWeekdays: args.nonWorkingWeekdays,
    formulaLibrary: args.formulaLibrary,
    jobItem: args.jobItem,
    materialCatalog: args.materialCatalog,
    materialPricing: args.materialPricing,
    materialFactorToBase: args.materialFactorToBase,
    actualConsumption: args.actualConsumption,
    teamProfiles: args.teamProfiles,
  });
}
