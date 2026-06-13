import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export async function countMaterialBlockingLinks(
  tx: Tx,
  params: { companyId: string; materialId: string }
): Promise<number> {
  const { companyId, materialId } = params;
  const [transactions, deliveryNoteLines, trackableLinks] = await Promise.all([
    tx.transaction.count({ where: { companyId, materialId } }),
    tx.deliveryNoteMaterialLine.count({ where: { companyId, materialId } }),
    tx.jobItemTrackableMaterialLink.count({ where: { companyId, materialId } }),
  ]);
  return transactions + deliveryNoteLines + trackableLinks;
}

/** Remove a material and non-ledger child rows. Caller must ensure no blocking ledger links remain. */
export async function permanentlyDeleteMaterial(
  tx: Tx,
  params: { companyId: string; materialId: string }
) {
  const { companyId, materialId } = params;

  const batchIds = (
    await tx.stockBatch.findMany({
      where: { companyId, materialId },
      select: { id: true },
    })
  ).map((batch) => batch.id);

  if (batchIds.length > 0) {
    await tx.transactionBatch.deleteMany({ where: { batchId: { in: batchIds } } });
    await tx.stockBatch.deleteMany({ where: { id: { in: batchIds } } });
  }

  await tx.materialWarehouseStock.deleteMany({ where: { companyId, materialId } });
  await tx.materialUom.deleteMany({ where: { materialId } });
  await tx.materialAssemblyComponent.deleteMany({
    where: {
      OR: [{ assemblyMaterialId: materialId }, { componentMaterialId: materialId }],
    },
  });
  await tx.materialLog.deleteMany({ where: { companyId, materialId } });
  await tx.priceLog.deleteMany({ where: { companyId, materialId } });
  await tx.material.delete({ where: { id: materialId } });
}
