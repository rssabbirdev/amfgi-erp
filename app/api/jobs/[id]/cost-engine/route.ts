import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { buildJobItemEstimate, summarizeJobItemEstimates } from '@/lib/job-costing/formulaEngine';
import { getFactorToBase, resolvePricingSnapshot } from '@/lib/job-costing/pricing';
import { normalizeJobCostingSettings } from '@/lib/job-costing/settings';
import type { FormulaConfig, JobItemSpecifications, MaterialPricingSnapshot, PricingMode } from '@/lib/job-costing/types';
import { P } from '@/lib/permissions';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { z } from 'zod';

const CostEngineSchema = z.object({
  pricingMode: z.enum(['FIFO', 'MOVING_AVERAGE', 'CURRENT', 'CUSTOM']).default('FIFO'),
  postingDate: z.string().optional(),
  jobItemIds: z.array(z.string()).optional(),
  customUnitCosts: z.record(z.string(), z.number().min(0)).optional(),
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
    (!session.user.permissions.includes(P.JOB_VIEW) || !session.user.permissions.includes(P.MATERIAL_VIEW))
  ) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id: jobId } = await params;
  const body = await req.json();
  const parsed = CostEngineSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const companyId = session.user.activeCompanyId;
  const postingDate = parsed.data.postingDate ? new Date(parsed.data.postingDate) : new Date();
  if (Number.isNaN(postingDate.getTime())) {
    return errorResponse('Invalid posting date', 422);
  }

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      companyId,
    },
    select: {
      id: true,
      jobNumber: true,
      parentJobId: true,
    },
  });
  if (!job) return errorResponse('Job not found', 404);
  if (!job.parentJobId) return errorResponse('Job costing engine is only available on variation jobs', 422);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { jobCostingSettings: true },
  });

  const jobItems = await prisma.jobItem.findMany({
    where: {
      companyId,
      jobId,
      isActive: true,
      ...(parsed.data.jobItemIds && parsed.data.jobItemIds.length > 0 ? { id: { in: parsed.data.jobItemIds } } : {}),
    },
    include: {
      assignedEmployees: {
        orderBy: { sortOrder: 'asc' },
        select: {
          employeeId: true,
          sortOrder: true,
        },
      },
      formulaLibrary: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (jobItems.length === 0) {
    return errorResponse('No active job items found for this variation', 404);
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

  const assignedEmployeeIds = Array.from(
    new Set(
      jobItems.flatMap((item) =>
        item.assignedEmployees.map((entry) => entry.employeeId)
      )
    )
  );

  const [materials, employees, transactions] = await Promise.all([
    prisma.material.findMany({
      where: {
        companyId,
        id: { in: materialIds.length > 0 ? materialIds : ['__none__'] },
      },
      include: {
        materialUoms: true,
        stockBatches: {
          where: {
            companyId,
          },
          orderBy: { receivedDate: 'desc' },
        },
      },
    }),
    prisma.employee.findMany({
      where: {
        companyId,
        id: { in: assignedEmployeeIds.length > 0 ? assignedEmployeeIds : ['__none__'] },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        profileExtension: true,
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

  const pricingMode = parsed.data.pricingMode as PricingMode;
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
    materialPricing.set(
      material.id,
      resolvePricingSnapshot(normalizedMaterial, pricingMode, parsed.data.customUnitCosts?.[material.id])
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

  const settings = normalizeJobCostingSettings(company?.jobCostingSettings);
  const estimates = jobItems.map((item) =>
    buildJobItemEstimate({
      jobId: job.id,
      jobNumber: job.jobNumber,
      postingDate,
      nonWorkingWeekdays: settings.nonWorkingWeekdays,
      pricingMode,
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
      teamProfiles: item.assignedEmployees
        .map((entry) => employeeProfiles.get(entry.employeeId))
        .filter((value): value is NonNullable<typeof value> => Boolean(value)),
    })
  );

  return successResponse({
    job: {
      id: job.id,
      jobNumber: job.jobNumber,
      variationOnly: true,
    },
    settings,
    items: estimates,
    summary: summarizeJobItemEstimates(estimates, pricingMode),
    issueReconcileCompatible: estimates.every((item) =>
      item.materials.every((material) => material.issueReconcileCompatible)
    ),
  });
}
