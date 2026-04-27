import { WarehouseMode, type Prisma, type PrismaClient } from '@prisma/client';
import { ensureCompanyFallbackWarehouse } from './companyWarehouseMode';

type Tx = PrismaClient | Prisma.TransactionClient;

type ResolveWarehouseInput = {
  companyId: string;
  warehouseId?: string | null;
  warehouseName?: string | null;
  materialId?: string | null;
};

export type EffectiveWarehouse = {
  warehouseMode: WarehouseMode;
  warehouseId: string;
  warehouseName: string;
  source: 'explicit' | 'material-default' | 'fallback';
};

async function findWarehouseById(tx: Tx, companyId: string, warehouseId: string) {
  return tx.warehouse.findFirst({
    where: {
      id: warehouseId,
      companyId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

async function findWarehouseByName(tx: Tx, companyId: string, warehouseName: string) {
  return tx.warehouse.findFirst({
    where: {
      companyId,
      name: warehouseName,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

export async function resolveEffectiveWarehouse(
  tx: Tx,
  input: ResolveWarehouseInput
): Promise<EffectiveWarehouse> {
  const config = await ensureCompanyFallbackWarehouse(tx, input.companyId);
  const requestedId = input.warehouseId?.trim();
  const requestedName = input.warehouseName?.trim();

  if (config.warehouseMode !== WarehouseMode.DISABLED) {
    if (requestedId) {
      const warehouse = await findWarehouseById(tx, input.companyId, requestedId);
      if (!warehouse) throw new Error('Selected warehouse not found');
      return {
        warehouseMode: config.warehouseMode,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        source: 'explicit',
      };
    }

    if (requestedName) {
      const warehouse = await findWarehouseByName(tx, input.companyId, requestedName);
      if (!warehouse) throw new Error(`Selected warehouse not found: ${requestedName}`);
      return {
        warehouseMode: config.warehouseMode,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        source: 'explicit',
      };
    }

    if (input.materialId) {
      const material = await tx.material.findFirst({
        where: {
          id: input.materialId,
          companyId: input.companyId,
          warehouseId: { not: null },
        },
        select: {
          warehouseId: true,
          warehouse: true,
        },
      });

      if (material?.warehouseId && material.warehouse) {
        return {
          warehouseMode: config.warehouseMode,
          warehouseId: material.warehouseId,
          warehouseName: material.warehouse,
          source: 'material-default',
        };
      }
    }
  }

  return {
    warehouseMode: config.warehouseMode,
    warehouseId: config.stockFallbackWarehouseId,
    warehouseName: config.stockFallbackWarehouseName,
    source: 'fallback',
  };
}

export async function applyMaterialWarehouseDelta(
  tx: Tx,
  companyId: string,
  materialId: string,
  warehouseId: string,
  delta: number
) {
  if (!delta) return;

  const existing = await tx.materialWarehouseStock.findUnique({
    where: {
      companyId_materialId_warehouseId: {
        companyId,
        materialId,
        warehouseId,
      },
    },
    select: {
      companyId: true,
      materialId: true,
      warehouseId: true,
    },
  });

  if (existing) {
    await tx.materialWarehouseStock.update({
      where: {
        companyId_materialId_warehouseId: {
          companyId,
          materialId,
          warehouseId,
        },
      },
      data: {
        currentStock: {
          increment: delta,
        },
      },
    });
    return;
  }

  await tx.materialWarehouseStock.create({
    data: {
      companyId,
      materialId,
      warehouseId,
      currentStock: delta,
    },
  });
}
