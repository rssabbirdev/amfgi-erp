import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { buildJobItemEstimate } from '@/lib/job-costing/formulaEngine';
import { getFactorToBase, resolvePricingSnapshot } from '@/lib/job-costing/pricing';
import { normalizeJobCostingSettings } from '@/lib/job-costing/settings';
import type { FormulaConfig, JobItemSpecifications, MaterialPricingSnapshot } from '@/lib/job-costing/types';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

const EPSILON = 0.0005;

function getSelectedMaterialIdsFromSpecifications(specifications: JobItemSpecifications) {
  return Object.values(specifications.global ?? {}).filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
}

function getTransactionCost(txn: {
  type: 'STOCK_OUT' | 'RETURN';
  quantity: unknown;
  totalCost: unknown;
  batchesUsed: Array<{ costAmount: unknown }>;
}) {
  const quantity = decimalToNumberOrZero(txn.quantity);
  const cost = txn.batchesUsed.length > 0
    ? txn.batchesUsed.reduce((sum, row) => sum + decimalToNumberOrZero(row.costAmount), 0)
    : decimalToNumberOrZero(txn.totalCost);

  return {
    quantity,
    cost,
    isIssue: txn.type === 'STOCK_OUT',
  };
}

type ActualConsumptionEntry = {
  materialId: string;
  actualIssuedBaseQuantity: number;
  actualIssuedCost: number;
};

type JobProfitabilityRow = {
  customerId: string;
  customerName: string;
  parentJobId: string;
  parentJobNumber: string;
  variationJobId: string;
  variationJobNumber: string;
  variationDescription: string | null;
  status: string;
  budgetItemCount: number;
  budgetMaterialCount: number;
  budgetMaterialQuantity: number;
  budgetMaterialCost: number;
  issuedMaterialQuantity: number;
  issuedMaterialCost: number;
  returnedMaterialQuantity: number;
  returnedMaterialCost: number;
  netMaterialQuantity: number;
  netMaterialCost: number;
  reconcileQuantity: number;
  reconcileCost: number;
  unbudgetedMaterialCount: number;
  unbudgetedMaterialCost: number;
  materialCostVariance: number;
  budgetVariancePct: number | null;
  variationJobWorkValue: number | null;
  variationLpoValue: number | null;
  parentJobWorkValue: number | null;
  parentLpoValue: number | null;
  materialMarginAgainstVariationValue: number | null;
  warningCount: number;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('report.view')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { jobCostingSettings: true },
    });

    const variationJobs = await prisma.job.findMany({
      where: {
        companyId,
        parentJobId: { not: null },
      },
      select: {
        id: true,
        jobNumber: true,
        description: true,
        status: true,
        jobWorkValue: true,
        lpoValue: true,
        parentJobId: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        parentJob: {
          select: {
            id: true,
            jobNumber: true,
            jobWorkValue: true,
            lpoValue: true,
          },
        },
      },
      orderBy: [{ customer: { name: 'asc' } }, { jobNumber: 'asc' }],
    });

    const variationJobIds = variationJobs.map((job) => job.id);

    const jobItems = await prisma.jobItem.findMany({
      where: {
        companyId,
        jobId: { in: variationJobIds.length > 0 ? variationJobIds : ['__none__'] },
        isActive: true,
      },
      include: {
        assignedEmployees: {
          orderBy: { sortOrder: 'asc' },
          select: { employeeId: true },
        },
        formulaLibrary: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const jobItemsByJobId = new Map<string, typeof jobItems>();
    for (const item of jobItems) {
      const rows = jobItemsByJobId.get(item.jobId) ?? [];
      rows.push(item);
      jobItemsByJobId.set(item.jobId, rows);
    }

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

    const [budgetMaterials, jobTransactions] = await Promise.all([
      prisma.material.findMany({
        where: {
          companyId,
          id: { in: budgetMaterialIds.length > 0 ? budgetMaterialIds : ['__none__'] },
        },
        include: {
          materialUoms: true,
          stockBatches: {
            where: { companyId },
            orderBy: { receivedDate: 'desc' },
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          companyId,
          jobId: { in: variationJobIds.length > 0 ? variationJobIds : ['__none__'] },
          type: { in: ['STOCK_OUT', 'RETURN'] },
        },
        select: {
          jobId: true,
          materialId: true,
          type: true,
          quantity: true,
          totalCost: true,
          notes: true,
          batchesUsed: {
            select: {
              costAmount: true,
            },
          },
        },
      }),
    ]);

    const budgetMaterialById = new Map(budgetMaterials.map((material) => [material.id, material]));
    const materialCatalog = new Map(
      budgetMaterials.map((material) => [
        material.id,
        {
          id: material.id,
          name: material.name,
          unit: material.unit,
        },
      ])
    );

    const materialPricing = new Map<string, MaterialPricingSnapshot>();
    for (const material of budgetMaterials) {
      const normalizedMaterial = {
        ...material,
        unitCost: material.unitCost == null ? null : decimalToNumberOrZero(material.unitCost),
        stockBatches: material.stockBatches.map((batch) => ({
          ...batch,
          quantityReceived: decimalToNumberOrZero(batch.quantityReceived),
          quantityAvailable: decimalToNumberOrZero(batch.quantityAvailable),
          unitCost: decimalToNumberOrZero(batch.unitCost),
        })),
      };
      materialPricing.set(material.id, resolvePricingSnapshot(normalizedMaterial, 'FIFO'));
    }

    const actualConsumptionByJobId = new Map<string, Map<string, ActualConsumptionEntry>>();
    const actualTotalsByJobId = new Map<
      string,
      {
        issuedMaterialQuantity: number;
        issuedMaterialCost: number;
        returnedMaterialQuantity: number;
        returnedMaterialCost: number;
        reconcileQuantity: number;
        reconcileCost: number;
      }
    >();

    for (const txn of jobTransactions) {
      if (!txn.jobId) continue;

      const jobMaterialMap = actualConsumptionByJobId.get(txn.jobId) ?? new Map<string, ActualConsumptionEntry>();
      const current = jobMaterialMap.get(txn.materialId) ?? {
        materialId: txn.materialId,
        actualIssuedBaseQuantity: 0,
        actualIssuedCost: 0,
      };
      const totals = actualTotalsByJobId.get(txn.jobId) ?? {
        issuedMaterialQuantity: 0,
        issuedMaterialCost: 0,
        returnedMaterialQuantity: 0,
        returnedMaterialCost: 0,
        reconcileQuantity: 0,
        reconcileCost: 0,
      };

      const { quantity, cost, isIssue } = getTransactionCost(txn as typeof txn & { type: 'STOCK_OUT' | 'RETURN' });

      if (isIssue) {
        current.actualIssuedBaseQuantity += quantity;
        current.actualIssuedCost += cost;
        totals.issuedMaterialQuantity += quantity;
        totals.issuedMaterialCost += cost;
        if (txn.notes?.includes('Non-stock reconcile')) {
          totals.reconcileQuantity += quantity;
          totals.reconcileCost += cost;
        }
      } else {
        current.actualIssuedBaseQuantity -= quantity;
        current.actualIssuedCost -= cost;
        totals.returnedMaterialQuantity += quantity;
        totals.returnedMaterialCost += cost;
      }

      jobMaterialMap.set(txn.materialId, current);
      actualConsumptionByJobId.set(txn.jobId, jobMaterialMap);
      actualTotalsByJobId.set(txn.jobId, totals);
    }

    const settings = normalizeJobCostingSettings(company?.jobCostingSettings);

    const rows: JobProfitabilityRow[] = variationJobs.map((job) => {
      const items = jobItemsByJobId.get(job.id) ?? [];
      const actualConsumption = actualConsumptionByJobId.get(job.id) ?? new Map<string, ActualConsumptionEntry>();
      const actualTotals = actualTotalsByJobId.get(job.id) ?? {
        issuedMaterialQuantity: 0,
        issuedMaterialCost: 0,
        returnedMaterialQuantity: 0,
        returnedMaterialCost: 0,
        reconcileQuantity: 0,
        reconcileCost: 0,
      };

      const estimates = items.map((item) =>
        buildJobItemEstimate({
          jobId: job.id,
          jobNumber: job.jobNumber,
          postingDate: new Date(),
          nonWorkingWeekdays: settings.nonWorkingWeekdays,
          pricingMode: 'FIFO',
          formulaLibrary: {
            id: item.formulaLibrary.id,
            name: item.formulaLibrary.name,
            fabricationType: item.formulaLibrary.fabricationType,
            formulaConfig: item.formulaLibrary.formulaConfig as FormulaConfig,
          },
          jobItem: {
            id: item.id,
            name: item.name,
            specifications: item.specifications as JobItemSpecifications,
            assignedEmployeeIds: item.assignedEmployees.map((entry) => entry.employeeId),
          },
          materialCatalog,
          materialPricing,
          materialFactorToBase: (materialId, quantityUomId) => {
            const material = budgetMaterialById.get(materialId);
            return material ? getFactorToBase(material, quantityUomId) : 1;
          },
          actualConsumption,
          teamProfiles: [],
        })
      );

      const budgetMaterials = new Map<
        string,
        { materialId: string; estimatedBaseQuantity: number; quotedCost: number }
      >();

      for (const estimate of estimates) {
        for (const material of estimate.materials) {
          const current = budgetMaterials.get(material.materialId) ?? {
            materialId: material.materialId,
            estimatedBaseQuantity: 0,
            quotedCost: 0,
          };
          current.estimatedBaseQuantity += material.estimatedBaseQuantity;
          current.quotedCost += material.quotedCost;
          budgetMaterials.set(material.materialId, current);
        }
      }

      let budgetMaterialQuantity = 0;
      let budgetMaterialCost = 0;
      for (const material of budgetMaterials.values()) {
        budgetMaterialQuantity += material.estimatedBaseQuantity;
        budgetMaterialCost += material.quotedCost;
      }

      const netMaterialQuantity = actualTotals.issuedMaterialQuantity - actualTotals.returnedMaterialQuantity;
      const netMaterialCost = actualTotals.issuedMaterialCost - actualTotals.returnedMaterialCost;
      const materialCostVariance = netMaterialCost - budgetMaterialCost;

      let unbudgetedMaterialCount = 0;
      let unbudgetedMaterialCost = 0;
      for (const [materialId, actual] of actualConsumption.entries()) {
        if (actual.actualIssuedBaseQuantity <= EPSILON && actual.actualIssuedCost <= EPSILON) continue;
        if (budgetMaterials.has(materialId)) continue;
        if (actual.actualIssuedCost <= EPSILON) continue;
        unbudgetedMaterialCount += 1;
        unbudgetedMaterialCost += actual.actualIssuedCost;
      }

      const variationJobWorkValue = decimalToNumberOrZero(job.jobWorkValue) || null;
      const variationLpoValue = decimalToNumberOrZero(job.lpoValue) || null;
      const parentJobWorkValue = decimalToNumberOrZero(job.parentJob?.jobWorkValue) || null;
      const parentLpoValue = decimalToNumberOrZero(job.parentJob?.lpoValue) || null;

      return {
        customerId: job.customerId,
        customerName: job.customer?.name ?? 'Unknown customer',
        parentJobId: job.parentJobId ?? '',
        parentJobNumber: job.parentJob?.jobNumber ?? 'Unknown parent',
        variationJobId: job.id,
        variationJobNumber: job.jobNumber,
        variationDescription: job.description,
        status: job.status,
        budgetItemCount: items.length,
        budgetMaterialCount: budgetMaterials.size,
        budgetMaterialQuantity,
        budgetMaterialCost,
        issuedMaterialQuantity: actualTotals.issuedMaterialQuantity,
        issuedMaterialCost: actualTotals.issuedMaterialCost,
        returnedMaterialQuantity: actualTotals.returnedMaterialQuantity,
        returnedMaterialCost: actualTotals.returnedMaterialCost,
        netMaterialQuantity,
        netMaterialCost,
        reconcileQuantity: actualTotals.reconcileQuantity,
        reconcileCost: actualTotals.reconcileCost,
        unbudgetedMaterialCount,
        unbudgetedMaterialCost,
        materialCostVariance,
        budgetVariancePct: budgetMaterialCost > EPSILON ? (materialCostVariance / budgetMaterialCost) * 100 : null,
        variationJobWorkValue,
        variationLpoValue,
        parentJobWorkValue,
        parentLpoValue,
        materialMarginAgainstVariationValue:
          variationJobWorkValue != null ? variationJobWorkValue - netMaterialCost : null,
        warningCount: estimates.reduce((sum, estimate) => sum + estimate.warnings.length, 0),
      };
    });

    return successResponse({
      summary: {
        totalVariations: rows.length,
        activeVariations: rows.filter((row) => row.status === 'ACTIVE').length,
        customersCovered: new Set(rows.map((row) => row.customerId)).size,
        totalBudgetMaterialCost: rows.reduce((sum, row) => sum + row.budgetMaterialCost, 0),
        totalNetMaterialCost: rows.reduce((sum, row) => sum + row.netMaterialCost, 0),
        overBudgetCount: rows.filter((row) => row.materialCostVariance > 0.005).length,
        withUnbudgetedMaterialCount: rows.filter((row) => row.unbudgetedMaterialCount > 0).length,
        reconcileLinkedCount: rows.filter((row) => row.reconcileCost > 0.005).length,
      },
      rows: rows.sort((a, b) => b.materialCostVariance - a.materialCostVariance || a.variationJobNumber.localeCompare(b.variationJobNumber)),
    });
  } catch (error) {
    console.error('[job-profitability]', error);
    return errorResponse('Failed to load job profitability report', 500);
  }
}
