import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { serializeJobWithContacts } from '@/lib/jobs/jobContacts';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { parseDeliveryContactPerson } from '@/lib/deliveryNoteNumber';
import {
  resolveTransactionFifoUnitCost,
  resolveTransactionNetLineCost,
} from '@/lib/stock/transactionFifoUnitCost';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { resolveEntryCreatedBy } from '@/lib/deliveryNote/resolveCreatedBy';

function mapCustomItemsFromJson(json: unknown): Array<{ name: string; description: string; unit: string; qty: string }> {
  if (!Array.isArray(json)) return [];
  const out: Array<{ name: string; description: string; unit: string; qty: string }> = [];
  for (const row of json) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    out.push({
      name: typeof o.name === 'string' ? o.name : String(o.name ?? ''),
      description: typeof o.description === 'string' ? o.description : '',
      unit: typeof o.unit === 'string' ? o.unit : String(o.unit ?? ''),
      qty: typeof o.qty === 'string' ? o.qty : String(o.qty ?? ''),
    });
  }
  return out;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { searchParams } = new URL(req.url);
  const filterType = searchParams.get('filterType') ?? 'all';
  const dateStr = searchParams.get('date');
  const limitParam = searchParams.get('limit');
  const offset = parseListOffset(searchParams.get('offset'));
  const noteType = searchParams.get('noteType') ?? 'all';
  const jobSearch = searchParams.get('jobSearch')?.trim().toLowerCase() ?? '';
  const deliveryNoteSearchRaw = searchParams.get('deliveryNoteSearch')?.trim().replace(/^#/i, '') ?? '';
  const searchRaw = searchParams.get('search')?.trim().toLowerCase() ?? '';

  let startDate = new Date(0);
  let endDate = new Date();

  if (filterType === 'day' && dateStr) {
    const date = new Date(dateStr);
    startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  } else if (filterType === 'month' && dateStr) {
    const date = new Date(dateStr);
    startDate = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      type: 'STOCK_OUT',
      date: { gte: startDate, lte: endDate },
    },
    select: {
      id: true,
      companyId: true,
      type: true,
      performedBy: true,
      performedByUserId: true,
      performedByName: true,
      materialId: true,
      quantity: true,
      jobId: true,
      notes: true,
      isDeliveryNote: true,
      date: true,
      createdAt: true,
      totalCost: true,
      averageCost: true,
      signedCopyUrl: true,
      deliveryNoteId: true,
      deliveryNote: {
        select: {
          id: true,
          number: true,
          documentNotes: true,
          customItemsJson: true,
          contactPerson: true,
          deliveryType: true,
          transitStatus: true,
          supplierId: true,
          createdByUserId: true,
          createdByName: true,
          supplier: { select: { id: true, name: true } },
        },
      },
      warehouse: {
        select: { id: true, name: true },
      },
      material: {
        select: { id: true, name: true, unit: true, unitCost: true },
      },
      job: {
        select: {
          id: true,
          jobNumber: true,
          description: true,
          contactPerson: true,
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  const creatorIds = Array.from(
    new Set(
      [
        ...transactions.map((txn) => txn.performedByUserId?.trim() ?? ''),
        ...transactions.map((txn) => txn.deliveryNote?.createdByUserId?.trim() ?? ''),
      ].filter(Boolean)
    )
  );

  const creators = creatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, name: true, email: true, signatureUrl: true },
      })
    : [];
  const creatorsById = new Map(creators.map((u) => [u.id, u]));

  const stockOutIds = transactions.map((txn) => txn.id);
  const returnQuantityByParentId = new Map<string, number>();
  if (stockOutIds.length > 0) {
    const returnTxns = await prisma.transaction.findMany({
      where: {
        companyId,
        type: 'RETURN',
        parentTransactionId: { in: stockOutIds },
      },
      select: { parentTransactionId: true, quantity: true },
    });
    for (const returnTxn of returnTxns) {
      const parentId = returnTxn.parentTransactionId;
      if (!parentId) continue;
      const qty = decimalToNumberOrZero(returnTxn.quantity);
      returnQuantityByParentId.set(parentId, (returnQuantityByParentId.get(parentId) ?? 0) + qty);
    }
  }

  const groupedMap = new Map<string, typeof transactions>();
  for (const txn of transactions) {
    const dateOnly = txn.date.toISOString().split('T')[0];
    const isDeliveryNote = txn.isDeliveryNote ?? false;
    const key = isDeliveryNote
      ? txn.deliveryNoteId
        ? `dn-${txn.deliveryNoteId}`
        : `${txn.jobId}-${dateOnly}-dn-${txn.id}`
      : `${txn.jobId}-${dateOnly}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, []);
    }
    groupedMap.get(key)!.push(txn);
  }

  const enrichedEntries = Array.from(groupedMap.values()).map((groupedTxns) => {
      const materialsMap = new Map<
        string,
        {
          materialId: string;
          materialName: string;
          materialUnit: string;
          warehouseId: string | null;
          warehouseName: string | null;
          quantity: number;
          unitCost: number;
          costTotal: number;
          transactionIds: string[];
        }
      >();
      let totalNetQuantity = 0;
      let totalValuation = 0;

      for (const txn of groupedTxns) {
        const returnQuantity = returnQuantityByParentId.get(txn.id) ?? 0;
        const netQuantity = decimalToNumberOrZero(txn.quantity) - returnQuantity;
        if (netQuantity <= 0) continue;

        totalNetQuantity += netQuantity;

        const key = txn.materialId;
        const unitCost = resolveTransactionFifoUnitCost(txn);
        const lineCost = resolveTransactionNetLineCost(txn, netQuantity);
        totalValuation += lineCost;

        if (materialsMap.has(key)) {
          const existing = materialsMap.get(key)!;
          existing.quantity += netQuantity;
          existing.costTotal += lineCost;
          existing.unitCost = existing.quantity > 0 ? existing.costTotal / existing.quantity : unitCost;
          existing.transactionIds.push(txn.id);
        } else {
          materialsMap.set(key, {
            materialId: txn.materialId,
            materialName: txn.material?.name ?? 'Unknown',
            materialUnit: txn.material?.unit ?? '-',
            warehouseId: txn.warehouse?.id ?? null,
            warehouseName: txn.warehouse?.name ?? null,
            quantity: netQuantity,
            unitCost,
            costTotal: lineCost,
            transactionIds: [txn.id],
          });
        }
      }

      const firstTxn = groupedTxns[0];
      const serializedJob = firstTxn.job ? serializeJobWithContacts(firstTxn.job) : null;
      const dateOnly = firstTxn.date.toISOString().split('T')[0];
      const isDeliveryNote = firstTxn.isDeliveryNote ?? false;
      const entryId = isDeliveryNote
        ? firstTxn.deliveryNoteId
          ? `dn-${firstTxn.deliveryNoteId}`
          : `${firstTxn.jobId}-${dateOnly}-dn-${firstTxn.id}`
        : `${firstTxn.jobId}-${dateOnly}`;
      const deliveryNoteNumber =
        firstTxn.deliveryNote?.number ??
        (() => {
          const m = firstTxn.notes?.match(/--- DELIVERY NOTE #(\d+)/);
          return m?.[1] ? parseInt(m[1], 10) : null;
        })();
      const deliveryNoteContactPerson =
        firstTxn.deliveryNote?.contactPerson?.trim() ||
        parseDeliveryContactPerson(firstTxn.notes) ||
        undefined;

      const ledgerCreatedAt = new Date(
        Math.max(...groupedTxns.map((t) => new Date(t.createdAt).getTime()))
      );

      const createdBy = resolveEntryCreatedBy(firstTxn.deliveryNote, firstTxn, creatorsById);

      return {
        id: entryId,
        _id: entryId,
        entryId,
        jobId: firstTxn.jobId,
        jobNumber: firstTxn.job?.jobNumber ?? 'N/A',
        jobDescription: firstTxn.job?.description ?? '',
        jobContactPerson: serializedJob?.contactPerson ?? undefined,
        jobContactsJson: serializedJob?.contactsJson ?? undefined,
        dispatchDate: firstTxn.date,
        ledgerCreatedAt,
        totalQuantity: totalNetQuantity,
        totalValuation,
        materialsCount: materialsMap.size,
        materials: Array.from(materialsMap.values()).map(({ costTotal: _costTotal, ...material }) => material),
        transactionIds: groupedTxns.map((t) => t.id),
        transactionCount: groupedTxns.length,
        notes: firstTxn.notes ?? undefined,
        isDeliveryNote: firstTxn.isDeliveryNote ?? false,
        deliveryNoteId: firstTxn.deliveryNoteId ?? undefined,
        deliveryNoteNumber: deliveryNoteNumber ?? undefined,
        deliveryNoteContactPerson,
        documentNotes: firstTxn.deliveryNote?.documentNotes ?? undefined,
        customItemsJson: firstTxn.deliveryNote?.customItemsJson ?? undefined,
        signedCopyUrl: firstTxn.signedCopyUrl ?? undefined,
        ...createdBy,
        deliveryType: firstTxn.deliveryNote?.deliveryType ?? 'DISPATCH',
        transitStatus: firstTxn.deliveryNote?.transitStatus ?? undefined,
        supplierId: firstTxn.deliveryNote?.supplierId ?? undefined,
        supplierName: firstTxn.deliveryNote?.supplier?.name ?? undefined,
      };
  });

  const seenDeliveryNoteIds = new Set(
    enrichedEntries.map((e) => e.deliveryNoteId).filter((id): id is string => Boolean(id))
  );

  const standaloneCandidates = await prisma.deliveryNote.findMany({
    where: {
      companyId,
      date: { gte: startDate, lte: endDate },
      OR: [{ materialDispatchSkipped: true }, { deliveryType: 'SUBCONTRACT' }],
    },
    select: {
      id: true,
      number: true,
      jobId: true,
      date: true,
      createdAt: true,
      documentNotes: true,
      customItemsJson: true,
      contactPerson: true,
      deliveryType: true,
      transitStatus: true,
      supplierId: true,
      createdByUserId: true,
      createdByName: true,
      supplier: { select: { id: true, name: true } },
      job: {
        select: {
          id: true,
          jobNumber: true,
          description: true,
          contactPerson: true,
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
      materialLines: {
        orderBy: { sortOrder: 'asc' },
        select: {
          materialId: true,
          issuedQty: true,
          receivedQty: true,
          sourceWarehouseId: true,
          issueTransferOutId: true,
          material: { select: { id: true, name: true, unit: true, unitCost: true } },
          sourceWarehouse: { select: { id: true, name: true } },
        },
      },
    },
  });

  const subcontractTransferOutIds = Array.from(
    new Set(
      standaloneCandidates.flatMap((dn) =>
        dn.materialLines
          .map((line) => line.issueTransferOutId)
          .filter((id): id is string => Boolean(id))
      )
    )
  );
  const subcontractTransferOutTxns =
    subcontractTransferOutIds.length > 0
      ? await prisma.transaction.findMany({
          where: { companyId, id: { in: subcontractTransferOutIds } },
          select: {
            id: true,
            averageCost: true,
            totalCost: true,
            quantity: true,
            performedByUserId: true,
            performedByName: true,
            performedBy: true,
            material: { select: { unitCost: true } },
          },
        })
      : [];
  const subcontractTransferActorById = new Map(
    subcontractTransferOutTxns.map((txn) => [txn.id, txn])
  );
  const subcontractFifoUnitCostByTransferId = new Map(
    subcontractTransferOutTxns.map((txn) => [txn.id, resolveTransactionFifoUnitCost(txn)])
  );

  const standaloneCreatorIds = Array.from(
    new Set(
      [
        ...standaloneCandidates.map((dn) => dn.createdByUserId?.trim() ?? ''),
        ...subcontractTransferOutTxns.map((txn) => txn.performedByUserId?.trim() ?? ''),
      ].filter((id) => id && !creatorsById.has(id))
    )
  );
  if (standaloneCreatorIds.length > 0) {
    const extraCreators = await prisma.user.findMany({
      where: { id: { in: standaloneCreatorIds } },
      select: { id: true, name: true, email: true, signatureUrl: true },
    });
    for (const user of extraCreators) {
      creatorsById.set(user.id, user);
    }
  }

  for (const dn of standaloneCandidates) {
    if (seenDeliveryNoteIds.has(dn.id)) continue;

    const serializedJob = dn.job ? serializeJobWithContacts(dn.job) : null;

    const subcontractMaterials =
      dn.deliveryType === 'SUBCONTRACT'
        ? dn.materialLines.map((line) => {
            const issued = decimalToNumberOrZero(line.issuedQty);
            const received = decimalToNumberOrZero(line.receivedQty);
            const net = Math.max(0, issued - received);
            const unitCost =
              (line.issueTransferOutId
                ? subcontractFifoUnitCostByTransferId.get(line.issueTransferOutId)
                : undefined) ?? decimalToNumberOrZero(line.material.unitCost);
            return {
              materialId: line.materialId,
              materialName: line.material.name,
              materialUnit: line.material.unit,
              warehouseId: line.sourceWarehouseId,
              warehouseName: line.sourceWarehouse.name,
              quantity: net,
              unitCost,
              transactionIds: line.issueTransferOutId ? [line.issueTransferOutId] : [],
            };
          })
        : [];

    const totalSubQty = subcontractMaterials.reduce((sum, row) => sum + row.quantity, 0);
    const totalSubVal = subcontractMaterials.reduce((sum, row) => sum + row.quantity * row.unitCost, 0);

    const firstTransferOutId = dn.materialLines.find((line) => line.issueTransferOutId)?.issueTransferOutId;
    const transferActor = firstTransferOutId
      ? subcontractTransferActorById.get(firstTransferOutId)
      : undefined;
    const createdBy = resolveEntryCreatedBy(dn, transferActor, creatorsById);

    enrichedEntries.push({
      id: `dn-${dn.id}`,
      _id: `dn-${dn.id}`,
      entryId: `dn-${dn.id}`,
      jobId: dn.jobId ?? '',
      jobNumber: dn.job?.jobNumber ?? 'N/A',
      jobDescription: dn.job?.description ?? '',
      jobContactPerson: serializedJob?.contactPerson ?? undefined,
      jobContactsJson: serializedJob?.contactsJson ?? undefined,
      dispatchDate: dn.date,
      ledgerCreatedAt: dn.createdAt,
      totalQuantity: totalSubQty,
      totalValuation: totalSubVal,
      materialsCount: subcontractMaterials.length,
      materials: subcontractMaterials,
      transactionIds: [],
      transactionCount: 0,
      isDeliveryNote: true,
      deliveryNoteId: dn.id,
      deliveryNoteNumber: dn.number,
      deliveryNoteContactPerson: dn.contactPerson?.trim() || undefined,
      documentNotes: dn.documentNotes ?? undefined,
      customItemsJson: dn.customItemsJson ?? undefined,
      ...createdBy,
      deliveryType: dn.deliveryType,
      transitStatus: dn.transitStatus ?? undefined,
      supplierId: dn.supplierId ?? undefined,
      supplierName: dn.supplier?.name ?? undefined,
    } as unknown as (typeof enrichedEntries)[number]);
  }

  enrichedEntries.sort((a, b) => {
    const ta = new Date(a.ledgerCreatedAt ?? a.dispatchDate).getTime();
    const tb = new Date(b.ledgerCreatedAt ?? b.dispatchDate).getTime();
    return tb - ta;
  });

  const filteredEntries = enrichedEntries.filter((entry) => {
    if (noteType === 'delivery' && !entry.isDeliveryNote) return false;
    if (noteType === 'dispatch' && entry.isDeliveryNote) return false;
    if (noteType === 'transit') {
      if (!entry.isDeliveryNote || entry.deliveryType !== 'SUBCONTRACT') return false;
      const status = entry.transitStatus;
      if (status !== 'ON_TRANSIT' && status !== 'PARTIALLY_RECEIVED') return false;
    }

    if (searchRaw) {
      const needle = searchRaw.replace(/^#/, '');
      const jobHay = [entry.jobNumber, entry.jobDescription, entry.supplierName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (jobHay.includes(needle)) return true;
      if (entry.isDeliveryNote) {
        const dn =
          entry.deliveryNoteNumber ??
          (() => {
            const m = entry.notes?.match(/--- DELIVERY NOTE #(\d+)/);
            return m?.[1] ? parseInt(m[1], 10) : null;
          })();
        if (dn != null && String(dn).includes(needle)) return true;
      }
      return false;
    }

    if (jobSearch) {
      const hay = [entry.jobNumber, entry.jobDescription, entry.supplierName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(jobSearch)) return false;
    }
    if (deliveryNoteSearchRaw) {
      if (!entry.isDeliveryNote) return false;
      const dn =
        entry.deliveryNoteNumber ??
        (() => {
          const m = entry.notes?.match(/--- DELIVERY NOTE #(\d+)/);
          return m?.[1] ? parseInt(m[1], 10) : null;
        })();
      if (dn == null || !String(dn).includes(deliveryNoteSearchRaw)) return false;
    }
    return true;
  });

  const dateRange = {
    startDate,
    endDate,
    filterType,
  };

  if (limitParam !== null) {
    const limit = parseListLimit(limitParam);
    return successResponse({
      entries: filteredEntries.slice(offset, offset + limit),
      total: filteredEntries.length,
      dateRange,
    });
  }

  return successResponse({
    entries: filteredEntries,
    total: filteredEntries.length,
    dateRange,
  });
}
