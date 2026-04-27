import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

export async function ensureCategoryRef(
  tx: Tx,
  companyId: string,
  categoryName?: string | null
) {
  const name = categoryName?.trim();
  if (!name) {
    return {
      category: null,
      categoryId: null as string | null,
      categoryName: null as string | null,
    };
  }

  const category = await tx.category.upsert({
    where: {
      companyId_name: {
        companyId,
        name,
      },
    },
    update: {
      isActive: true,
    },
    create: {
      companyId,
      name,
      isActive: true,
    },
  });

  return {
    category,
    categoryId: category.id,
    categoryName: category.name,
  };
}

export async function ensureWarehouseRef(
  tx: Tx,
  companyId: string,
  warehouseName?: string | null
) {
  const name = warehouseName?.trim();
  if (!name) {
    return {
      warehouse: null,
      warehouseId: null as string | null,
      warehouseName: null as string | null,
    };
  }

  const warehouse = await tx.warehouse.upsert({
    where: {
      companyId_name: {
        companyId,
        name,
      },
    },
    update: {
      isActive: true,
    },
    create: {
      companyId,
      name,
      isActive: true,
    },
  });

  return {
    warehouse,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
  };
}
