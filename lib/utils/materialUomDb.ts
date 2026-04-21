import type { Prisma } from '@prisma/client';
import { computeFactorToBase } from '@/lib/utils/materialUom';

type Tx = Pick<Prisma.TransactionClient, 'materialUom'>;

/** Convert a quantity expressed in `quantityUomId` into base-UOM amount (stock quantity). */
export async function resolveQuantityToBase(
  tx: Tx,
  materialId: string,
  quantity: number,
  quantityUomId: string | undefined | null
): Promise<number> {
  if (quantityUomId == null || quantityUomId === '') return quantity;
  const uoms = await tx.materialUom.findMany({ where: { materialId } });
  if (uoms.length === 0) return quantity;
  const map = new Map(uoms.map((u) => [u.id, u]));
  if (!map.has(quantityUomId)) {
    throw new Error('Invalid quantity UOM for this material');
  }
  const factor = computeFactorToBase(quantityUomId, map);
  return quantity * factor;
}

export async function resolveFactorToBase(
  tx: Tx,
  materialId: string,
  quantityUomId: string | undefined | null
): Promise<number> {
  if (quantityUomId == null || quantityUomId === '') return 1;
  const uoms = await tx.materialUom.findMany({ where: { materialId } });
  if (uoms.length === 0) return 1;
  const map = new Map(uoms.map((u) => [u.id, u]));
  if (!map.has(quantityUomId)) {
    throw new Error('Invalid quantity UOM for this material');
  }
  return computeFactorToBase(quantityUomId, map);
}
