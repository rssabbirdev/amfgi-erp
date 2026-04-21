import type { MaterialUom } from '@prisma/client';

export type MaterialUomWithUnit = MaterialUom & { unit: { id: string; name: string } };

/** 1 × this UOM = factor × base UOM (stock is always stored in base UOM amount). */
export function computeFactorToBase(
  uomId: string,
  byId: Map<string, Pick<MaterialUom, 'id' | 'parentUomId' | 'factorToParent'>>,
  depth = 0
): number {
  if (depth > 32) throw new Error('Invalid UOM chain (cycle or too deep)');
  const u = byId.get(uomId);
  if (!u) throw new Error('Unknown material UOM');
  if (!u.parentUomId) {
    if (u.factorToParent <= 0) throw new Error('Base UOM factor must be positive');
    return u.factorToParent;
  }
  if (u.factorToParent <= 0) throw new Error('UOM factor must be positive');
  return u.factorToParent * computeFactorToBase(u.parentUomId, byId, depth + 1);
}

export function serializeMaterialUoms(rows: MaterialUomWithUnit[]) {
  const map = new Map(rows.map((r) => [r.id, r]));
  return rows.map((r) => ({
    id: r.id,
    unitId: r.unitId,
    unitName: r.unit.name,
    isBase: r.isBase,
    parentUomId: r.parentUomId,
    factorToParent: r.factorToParent,
    factorToBase: computeFactorToBase(r.id, map),
  }));
}

export function assertAcyclicNewParent(
  rows: Pick<MaterialUom, 'id' | 'parentUomId'>[],
  newParentId: string | null,
  editingId?: string
): void {
  if (!newParentId) return;
  let cur: string | null = newParentId;
  const byId = new Map(rows.map((r) => [r.id, r.parentUomId]));
  let depth = 0;
  while (cur) {
    if (depth++ > 64) throw new Error('Invalid parent chain');
    if (editingId && cur === editingId) throw new Error('Parent would create a cycle');
    cur = byId.get(cur) ?? null;
  }
}
