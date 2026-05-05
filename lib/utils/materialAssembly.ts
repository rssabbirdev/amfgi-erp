import { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

function roundMoney(value: number): number {
  return Number(value.toFixed(4));
}

export async function recalculateAssemblyUnitCostTx(
  tx: TxClient,
  companyId: string,
  assemblyMaterialId: string,
  changedBy: string,
  notes?: string
) {
  const assembly = await tx.material.findUnique({
    where: { id: assemblyMaterialId },
    select: {
      id: true,
      companyId: true,
      stockType: true,
      unitCost: true,
      assemblyOutputQuantity: true,
      assemblyOverheadPercent: true,
    },
  });

  if (!assembly || assembly.companyId !== companyId || assembly.stockType !== 'Stock Assembly') {
    return;
  }

  const components = await tx.materialAssemblyComponent.findMany({
    where: { companyId, assemblyMaterialId },
    include: {
      componentMaterial: {
        select: { unitCost: true },
      },
    },
  });

  const outputQuantity = Number(assembly.assemblyOutputQuantity ?? 1);
  const overheadPercent = Math.max(Number(assembly.assemblyOverheadPercent ?? 0), 0);
  const safeOutput = outputQuantity > 0 ? outputQuantity : 1;
  const totalInputCost = components.reduce((sum, row) => {
    const qty = Number(row.quantity ?? 0);
    const unitCost = Number(row.componentMaterial.unitCost ?? 0);
    return sum + qty * unitCost;
  }, 0);
  const costWithOverhead = totalInputCost * (1 + overheadPercent / 100);
  const nextUnitCost = roundMoney(costWithOverhead / safeOutput);
  const prevUnitCost = Number(assembly.unitCost ?? 0);

  if (Math.abs(prevUnitCost - nextUnitCost) < 0.0001) {
    return;
  }

  await tx.material.update({
    where: { id: assemblyMaterialId },
    data: { unitCost: nextUnitCost },
  });

  await tx.priceLog.create({
    data: {
      companyId,
      materialId: assemblyMaterialId,
      previousPrice: prevUnitCost,
      currentPrice: nextUnitCost,
      source: 'manual',
      changedBy,
      notes: notes ?? 'Auto-updated from Stock Assembly components',
    },
  });
}

export async function recalculateAssemblyAncestorsTx(
  tx: TxClient,
  companyId: string,
  changedComponentMaterialId: string,
  changedBy: string
) {
  const queue: string[] = [changedComponentMaterialId];
  const visitedAssemblies = new Set<string>();

  while (queue.length > 0) {
    const componentId = queue.shift();
    if (!componentId) continue;

    const parents = await tx.materialAssemblyComponent.findMany({
      where: { companyId, componentMaterialId: componentId },
      select: { assemblyMaterialId: true },
    });

    for (const parent of parents) {
      if (visitedAssemblies.has(parent.assemblyMaterialId)) {
        continue;
      }
      visitedAssemblies.add(parent.assemblyMaterialId);
      await recalculateAssemblyUnitCostTx(
        tx,
        companyId,
        parent.assemblyMaterialId,
        changedBy,
        'Auto-updated from linked component cost change'
      );
      queue.push(parent.assemblyMaterialId);
    }
  }
}
