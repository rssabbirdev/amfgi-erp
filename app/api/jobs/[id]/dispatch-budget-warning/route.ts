import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { buildJobItemEstimate } from '@/lib/job-costing/formulaEngine';
import { resolvePricingSnapshot, getFactorToBase } from '@/lib/job-costing/pricing';
import { normalizeJobCostingSettings } from '@/lib/job-costing/settings';
import type { FormulaConfig, JobItemSpecifications, MaterialPricingSnapshot } from '@/lib/job-costing/types';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { z } from 'zod';

const DispatchBudgetWarningSchema = z.object({
  postingDate: z.string().optional(),
  lines: z.array(
    z.object({
      materialId: z.string().min(1),
      quantity: z.number().finite().min(0),
      quantityUomId: z.string().optional(),
      returnQty: z.number().finite().min(0).optional(),
    })
  ),
});

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

function getSelectedMaterialIdsFromSpecifications(specifications: JobItemSpecifications) {
  return Object.values(specifications.global ?? {}).filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !session.user.isSuperAdmin &&
    !session.user.permissions.includes('transaction.stock_out') &&
    !(session.user.permissions.includes('job.view') && session.user.permissions.includes('material.view'))
  ) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = DispatchBudgetWarningSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const { id: jobId } = await params;
  const companyId = session.user.activeCompanyId;
  const postingDate = parsed.data.postingDate ? new Date(parsed.data.postingDate) : new Date();
  if (Number.isNaN(postingDate.getTime())) {
    return errorResponse('Invalid posting date', 422);
  }

  try {
    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
      select: {
        id: true,
        jobNumber: true,
        parentJobId: true,
      },
    });

    if (!job) return errorResponse('Job not found', 404);

    if (!job.parentJobId) {
      return successResponse({
        applicable: false,
        reason: 'parent_job',
        warningCount: 0,
        rows: [],
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { jobCostingSettings: true },
    });

    const jobItems = await prisma.jobItem.findMany({
      where: {
        companyId,
        jobId,
        isActive: true,
      },
      include: {
        assignedEmployees: {
          orderBy: { sortOrder: 'asc' },
          select: {
            employeeId: true,
          },
        },
        formulaLibrary: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (jobItems.length === 0) {
      return successResponse({
        applicable: false,
        reason: 'no_budget_items',
        warningCount: 0,
        rows: [],
      });
    }

    const materialIds = Array.from(
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

    const [materials, transactions] = await Promise.all([
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
      prisma.transaction.findMany({
        where: {
          companyId,
          jobId,
          materialId: { in: materialIds.length > 0 ? materialIds : ['__none__'] },
          type: { in: ['STOCK_OUT', 'RETURN'] },
        },
        select: {
          materialId: true,
          type: true,
          quantity: true,
          totalCost: true,
          batchesUsed: {
            select: {
              costAmount: true,
            },
          },
        },
      }),
    ]);

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

    const materialCatalog = new Map(
      materials.map((material) => [
        material.id,
        {
          id: material.id,
          name: material.name,
          unit: material.unit,
        },
      ])
    );

    const materialPricing = new Map<string, MaterialPricingSnapshot>();
    for (const material of materials) {
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

    const settings = normalizeJobCostingSettings(company?.jobCostingSettings);
    const estimates = jobItems.map((item) =>
      buildJobItemEstimate({
        jobId: job.id,
        jobNumber: job.jobNumber,
        postingDate,
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
          const material = materials.find((entry) => entry.id === materialId);
          return material ? getFactorToBase(material, quantityUomId) : 1;
        },
        actualConsumption,
        teamProfiles: [],
      })
    );

    const budgetByMaterial = new Map<
      string,
      {
        materialId: string;
        materialName: string;
        baseUnit: string;
        estimatedBaseQuantity: number;
        quotedUnitCost: number;
        quotedCost: number;
        currentIssuedBaseQuantity: number;
        currentIssuedCost: number;
      }
    >();

    for (const item of estimates) {
      for (const material of item.materials) {
        const existing = budgetByMaterial.get(material.materialId);
        if (!existing) {
          budgetByMaterial.set(material.materialId, {
            materialId: material.materialId,
            materialName: material.materialName,
            baseUnit: material.baseUnit,
            estimatedBaseQuantity: material.estimatedBaseQuantity,
            quotedUnitCost: material.quotedUnitCost,
            quotedCost: material.quotedCost,
            currentIssuedBaseQuantity: material.actualIssuedBaseQuantity,
            currentIssuedCost: material.actualIssuedCost,
          });
          continue;
        }
        existing.estimatedBaseQuantity += material.estimatedBaseQuantity;
        existing.quotedCost += material.quotedCost;
        existing.currentIssuedBaseQuantity = material.actualIssuedBaseQuantity;
        existing.currentIssuedCost = material.actualIssuedCost;
      }
    }

    const pendingByMaterial = new Map<string, { pendingBaseQuantity: number; pendingProjectedCost: number }>();
    for (const line of parsed.data.lines) {
      const material = materials.find((entry) => entry.id === line.materialId);
      const factorToBase = material ? getFactorToBase(material, line.quantityUomId) : 1;
      const quantity = line.quantity * factorToBase;
      const returnQty = (line.returnQty ?? 0) * factorToBase;
      const pendingBaseQuantity = quantity - returnQty;
      if (Math.abs(pendingBaseQuantity) <= 0.0005) continue;
      const pricing = materialPricing.get(line.materialId);
      const current = pendingByMaterial.get(line.materialId) ?? {
        pendingBaseQuantity: 0,
        pendingProjectedCost: 0,
      };
      current.pendingBaseQuantity += pendingBaseQuantity;
      current.pendingProjectedCost += pendingBaseQuantity * (pricing?.baseUnitCost ?? 0);
      pendingByMaterial.set(line.materialId, current);
    }

    const warningRows = [];
    for (const [materialId, pending] of pendingByMaterial.entries()) {
      if (pending.pendingBaseQuantity <= 0.0005) continue;

      const budget = budgetByMaterial.get(materialId);
      const material = materials.find((entry) => entry.id === materialId);
      const fallbackPrice = materialPricing.get(materialId)?.baseUnitCost ?? decimalToNumberOrZero(material?.unitCost);

      if (!budget) {
        warningRows.push({
          materialId,
          materialName: material?.name ?? 'Unknown material',
          baseUnit: material?.unit ?? '-',
          estimatedBaseQuantity: 0,
          currentIssuedBaseQuantity: 0,
          pendingBaseQuantity: pending.pendingBaseQuantity,
          projectedIssuedBaseQuantity: pending.pendingBaseQuantity,
          quantityOverrun: pending.pendingBaseQuantity,
          quotedUnitCost: fallbackPrice,
          estimatedQuotedCost: 0,
          currentIssuedCost: 0,
          projectedIssuedCost: pending.pendingProjectedCost,
          costOverrun: pending.pendingProjectedCost,
          kind: 'unbudgeted_material',
        });
        continue;
      }

      const projectedIssuedBaseQuantity = budget.currentIssuedBaseQuantity + pending.pendingBaseQuantity;
      const projectedIssuedCost = budget.currentIssuedCost + pending.pendingProjectedCost;
      const quantityOverrun = projectedIssuedBaseQuantity - budget.estimatedBaseQuantity;
      const costOverrun = projectedIssuedCost - budget.quotedCost;

      if (quantityOverrun > 0.0005 || costOverrun > 0.005) {
        warningRows.push({
          materialId,
          materialName: budget.materialName,
          baseUnit: budget.baseUnit,
          estimatedBaseQuantity: budget.estimatedBaseQuantity,
          currentIssuedBaseQuantity: budget.currentIssuedBaseQuantity,
          pendingBaseQuantity: pending.pendingBaseQuantity,
          projectedIssuedBaseQuantity,
          quantityOverrun,
          quotedUnitCost: budget.quotedUnitCost,
          estimatedQuotedCost: budget.quotedCost,
          currentIssuedCost: budget.currentIssuedCost,
          projectedIssuedCost,
          costOverrun,
          kind: quantityOverrun > 0.0005 ? 'quantity_overrun' : 'cost_overrun',
        });
      }
    }

    return successResponse({
      applicable: true,
      reason: null,
      warningCount: warningRows.length,
      rows: warningRows.sort((a, b) => b.quantityOverrun - a.quantityOverrun || b.costOverrun - a.costOverrun),
    });
  } catch (error) {
    console.error('[dispatch-budget-warning]', error);
    return errorResponse('Failed to evaluate dispatch budget warning', 500);
  }
}
