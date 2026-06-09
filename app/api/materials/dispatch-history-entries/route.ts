import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { serializeJobWithContacts } from '@/lib/jobs/jobContacts';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

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
      signedCopyUrl: true,
      deliveryNoteId: true,
      deliveryNote: {
        select: { id: true, number: true, documentNotes: true, customItemsJson: true },
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
    new Set(transactions.map((txn) => txn.performedByUserId?.trim() ?? '').filter(Boolean))
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
          transactionIds: string[];
        }
      >();
      let totalNetQuantity = 0;
      let totalValuation = 0;

      for (const txn of groupedTxns) {
        const returnQuantity = returnQuantityByParentId.get(txn.id) ?? 0;
        const netQuantity = decimalToNumberOrZero(txn.quantity) - returnQuantity;
        totalNetQuantity += netQuantity;

        const key = txn.materialId;
        const unitCost = decimalToNumberOrZero(txn.material?.unitCost);
        totalValuation += netQuantity * unitCost;

        if (materialsMap.has(key)) {
          const existing = materialsMap.get(key)!;
          existing.quantity += netQuantity;
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

      const ledgerCreatedAt = new Date(
        Math.max(...groupedTxns.map((t) => new Date(t.createdAt).getTime()))
      );

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
        materials: Array.from(materialsMap.values()),
        transactionIds: groupedTxns.map((t) => t.id),
        transactionCount: groupedTxns.length,
        notes: firstTxn.notes ?? undefined,
        isDeliveryNote: firstTxn.isDeliveryNote ?? false,
        deliveryNoteId: firstTxn.deliveryNoteId ?? undefined,
        deliveryNoteNumber: deliveryNoteNumber ?? undefined,
        documentNotes: firstTxn.deliveryNote?.documentNotes ?? undefined,
        customItemsJson: firstTxn.deliveryNote?.customItemsJson ?? undefined,
        signedCopyUrl: firstTxn.signedCopyUrl ?? undefined,
        createdByUserId: firstTxn.performedByUserId ?? undefined,
        createdByName:
          (firstTxn.performedByUserId ? creatorsById.get(firstTxn.performedByUserId)?.name : undefined) ??
          firstTxn.performedByName ??
          firstTxn.performedBy ??
          undefined,
        createdByEmail:
          (firstTxn.performedByUserId ? creatorsById.get(firstTxn.performedByUserId)?.email : undefined) ??
          undefined,
        createdBySignatureUrl:
          (firstTxn.performedByUserId ? creatorsById.get(firstTxn.performedByUserId)?.signatureUrl : undefined) ??
          undefined,
      };
  });

  const seenDeliveryNoteIds = new Set(
    enrichedEntries.map((e) => e.deliveryNoteId).filter((id): id is string => Boolean(id))
  );

  const standaloneCandidates = await prisma.deliveryNote.findMany({
    where: {
      companyId,
      date: { gte: startDate, lte: endDate },
      materialDispatchSkipped: true,
    },
    select: {
      id: true,
      number: true,
      jobId: true,
      date: true,
      createdAt: true,
      documentNotes: true,
      customItemsJson: true,
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
  });

  for (const dn of standaloneCandidates) {
    if (seenDeliveryNoteIds.has(dn.id)) continue;

    const serializedJob = dn.job ? serializeJobWithContacts(dn.job) : null;

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
      totalQuantity: 0,
      totalValuation: 0,
      materialsCount: 0,
      materials: [],
      transactionIds: [],
      transactionCount: 0,
      isDeliveryNote: true,
      deliveryNoteId: dn.id,
      deliveryNoteNumber: dn.number,
      documentNotes: dn.documentNotes ?? undefined,
      customItemsJson: dn.customItemsJson ?? undefined,
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
    if (jobSearch) {
      const hay = [entry.jobNumber, entry.jobDescription].filter(Boolean).join(' ').toLowerCase();
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
