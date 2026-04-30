import type { Prisma, PrismaClient } from '@prisma/client';

type Tx = PrismaClient | Prisma.TransactionClient;

type RefInput = {
  id?: string | null;
  name?: string | null;
};

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

export async function resolveCategoryRef(
  tx: Tx,
  companyId: string,
  input?: RefInput | null
) {
  const id = input?.id?.trim();
  const name = input?.name?.trim();

  if (id) {
    const category = await tx.category.findUnique({
      where: {
        companyId_id: {
          companyId,
          id,
        },
      },
    });

    if (category) {
      if (!category.isActive) {
        await tx.category.update({
          where: { id: category.id },
          data: { isActive: true },
        });
      }

      return {
        category,
        categoryId: category.id,
        categoryName: category.name,
      };
    }
  }

  if (name) {
    return ensureCategoryRef(tx, companyId, name);
  }

  return {
    category: null,
    categoryId: null as string | null,
    categoryName: null as string | null,
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

export async function resolveWarehouseRef(
  tx: Tx,
  companyId: string,
  input?: RefInput | null
) {
  const id = input?.id?.trim();
  const name = input?.name?.trim();

  if (id) {
    const warehouse = await tx.warehouse.findUnique({
      where: {
        companyId_id: {
          companyId,
          id,
        },
      },
    });

    if (warehouse) {
      if (!warehouse.isActive) {
        await tx.warehouse.update({
          where: { id: warehouse.id },
          data: { isActive: true },
        });
      }

      return {
        warehouse,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
      };
    }
  }

  if (name) {
    return ensureWarehouseRef(tx, companyId, name);
  }

  return {
    warehouse: null,
    warehouseId: null as string | null,
    warehouseName: null as string | null,
  };
}

export async function findWarehouseRef(
  tx: Tx,
  companyId: string,
  input?: RefInput | null
) {
  const id = input?.id?.trim();
  const name = input?.name?.trim();

  if (id) {
    const warehouse = await tx.warehouse.findUnique({
      where: {
        companyId_id: {
          companyId,
          id,
        },
      },
    });

    if (!warehouse) {
      throw new Error(`Warehouse not found for ID: ${id}`);
    }

    return {
      warehouse,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
    };
  }

  if (name) {
    const warehouse = await tx.warehouse.findUnique({
      where: {
        companyId_name: {
          companyId,
          name,
        },
      },
    });

    if (!warehouse) {
      throw new Error(`Warehouse not found: ${name}`);
    }

    return {
      warehouse,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
    };
  }

  return {
    warehouse: null,
    warehouseId: null as string | null,
    warehouseName: null as string | null,
  };
}
