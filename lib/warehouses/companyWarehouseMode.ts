import { WarehouseMode, type Prisma, type PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

export const SYSTEM_FALLBACK_WAREHOUSE_NAME = 'System Default';

export type CompanyWarehouseConfig = {
  warehouseMode: WarehouseMode;
  stockFallbackWarehouseId: string;
  stockFallbackWarehouseName: string;
};

export function normalizeWarehouseMode(value: unknown): WarehouseMode {
  return WarehouseMode.REQUIRED;
}

export async function ensureCompanyFallbackWarehouse(
  tx: Tx,
  companyId: string
): Promise<CompanyWarehouseConfig> {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: {
      warehouseMode: true,
      stockFallbackWarehouseId: true,
      stockFallbackWarehouse: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
    },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  if (company.stockFallbackWarehouse?.id) {
    if (!company.stockFallbackWarehouse.isActive) {
      await tx.warehouse.update({
        where: { id: company.stockFallbackWarehouse.id },
        data: { isActive: true },
      });
    }

    return {
      warehouseMode: company.warehouseMode,
      stockFallbackWarehouseId: company.stockFallbackWarehouse.id,
      stockFallbackWarehouseName: company.stockFallbackWarehouse.name,
    };
  }

  const existingSystemWarehouse = await tx.warehouse.findFirst({
    where: {
      companyId,
      isSystem: true,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
    },
  });

  const fallbackWarehouse = existingSystemWarehouse
    ? await tx.warehouse.update({
        where: { id: existingSystemWarehouse.id },
        data: { isActive: true },
        select: {
          id: true,
          name: true,
        },
      })
    : await tx.warehouse.create({
        data: {
          companyId,
          name: SYSTEM_FALLBACK_WAREHOUSE_NAME,
          location: 'System-managed fallback warehouse',
          isActive: true,
          isSystem: true,
        },
        select: {
          id: true,
          name: true,
        },
      });

  await tx.company.update({
    where: { id: companyId },
    data: {
      stockFallbackWarehouseId: fallbackWarehouse.id,
    },
  });

  return {
    warehouseMode: company.warehouseMode,
    stockFallbackWarehouseId: fallbackWarehouse.id,
    stockFallbackWarehouseName: fallbackWarehouse.name,
  };
}

export async function assertWarehouseModeTransition(
  tx: Tx,
  companyId: string,
  nextMode: WarehouseMode
) {
  await ensureCompanyFallbackWarehouse(tx, companyId);

  if (nextMode !== WarehouseMode.REQUIRED) {
    return;
  }

  const activeUserWarehouses = await tx.warehouse.count({
    where: {
      companyId,
      isActive: true,
      isSystem: false,
    },
  });

  if (activeUserWarehouses === 0) {
    throw new Error('At least one active warehouse is required before enabling required warehouse tracking.');
  }
}
