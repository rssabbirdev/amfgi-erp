import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import {
  parseReceiptAdjustmentMetadata,
  parseReceiptCancellationMetadata,
  stripReceiptCancellationMarkers,
} from '@/lib/utils/receiptCancellation';
import {
  parseReceiptHeaderMetadata,
  resolveReceiptBillAmount,
} from '@/lib/utils/receiptHeaderMetadata';
import { getDeliveryNoteTransferReceiptNumbers } from '@/lib/stock/receiptHistoryFilters';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const filterType = searchParams.get('filterType') ?? 'all';
  const dateStr = searchParams.get('date');
  const limitParam = searchParams.get('limit');
  const offset = parseListOffset(searchParams.get('offset'));
  const search = searchParams.get('search')?.trim().toLowerCase() ?? '';

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

  try {
    // Get all StockBatches with receipt numbers in the date range
    const batches = await prisma.stockBatch.findMany({
      where: {
        companyId: session.user.activeCompanyId,
        receiptNumber: { not: null },
        receivedDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        material: true,
        warehouse: {
          select: { id: true, name: true },
        },
      },
      orderBy: { receivedDate: 'desc' },
    });

    // Group by receiptNumber
    const grouped = new Map<string, typeof batches>();
    batches.forEach((batch) => {
      if (batch.receiptNumber) {
        if (!grouped.has(batch.receiptNumber)) {
          grouped.set(batch.receiptNumber, []);
        }
        grouped.get(batch.receiptNumber)!.push(batch);
      }
    });

    // Format entries
    const enrichedEntries = Array.from(grouped.entries()).map(([receiptNumber, lines]) => {
      const materialGroups = new Map<string, {
        materialId: string;
        materialName: string;
        unit: string;
        warehouseId: string | null;
        warehouseName: string | null;
        quantityReceived: number;
        quantityAvailable: number;
        unitCost: number;
        totalCost: number;
        batchNumber: string;
      }>();
      for (const line of lines) {
        const materialId = line.materialId;
        const warehouseId = line.warehouse?.id ?? null;
        const unitCost = decimalToNumberOrZero(line.unitCost);
        const key = `${materialId}::${warehouseId ?? 'none'}::${unitCost}`;
        const current = materialGroups.get(key);
        if (current) {
          current.quantityReceived += decimalToNumberOrZero(line.quantityReceived);
          current.quantityAvailable += decimalToNumberOrZero(line.quantityAvailable);
          current.totalCost += decimalToNumberOrZero(line.totalCost);
        } else {
          materialGroups.set(key, {
            materialId,
            materialName: line.material?.name ?? 'Unknown',
            unit: line.material?.unit ?? '—',
            warehouseId,
            warehouseName: line.warehouse?.name ?? null,
            quantityReceived: decimalToNumberOrZero(line.quantityReceived),
            quantityAvailable: decimalToNumberOrZero(line.quantityAvailable),
            unitCost,
            totalCost: decimalToNumberOrZero(line.totalCost),
            batchNumber: line.batchNumber,
          });
        }
      }
      const materials = Array.from(materialGroups.values());

      const totalValue = lines.reduce((sum, line) => sum + decimalToNumberOrZero(line.totalCost), 0);
      const firstLine = lines[0];
      const cancellationMetadata = parseReceiptCancellationMetadata(firstLine?.notes);
      const adjustmentMetadata = parseReceiptAdjustmentMetadata(firstLine?.notes);
      const headerMetadata = parseReceiptHeaderMetadata(firstLine?.meta);
      const billAmount = resolveReceiptBillAmount(headerMetadata, totalValue);

      return {
        id: receiptNumber,
        receiptNumber,
        receivedDate: firstLine!.receivedDate,
        supplier: firstLine!.supplier || undefined,
        lpoNumber: headerMetadata.lpoNumber || undefined,
        supplierInvoiceNumber: headerMetadata.supplierInvoiceNumber || undefined,
        notes: stripReceiptCancellationMarkers(firstLine!.notes) || undefined,
        status: cancellationMetadata.isCancelled ? 'cancelled' : 'active',
        cancelledAt: cancellationMetadata.cancelledAt,
        cancellationReason: cancellationMetadata.cancellationReason,
        adjustedAt: adjustmentMetadata.adjustedAt,
        adjustmentReason: adjustmentMetadata.adjustmentReason,
        itemsCount: lines.length,
        totalValue,
        billAmount,
        includeTax: headerMetadata.includeTax ?? undefined,
        taxAmount: headerMetadata.taxAmount ?? undefined,
        materials,
      };
    });

    const deliveryNoteTransferReceipts = await getDeliveryNoteTransferReceiptNumbers(
      prisma,
      session.user.activeCompanyId,
      enrichedEntries.map((entry) => entry.receiptNumber)
    );

    const purchaseReceiptEntries = enrichedEntries.filter(
      (entry) => !deliveryNoteTransferReceipts.has(entry.receiptNumber)
    );

    const filteredEntries = search
      ? purchaseReceiptEntries.filter((entry) => {
          const haystack = [
            entry.receiptNumber,
            entry.supplier,
            entry.lpoNumber,
            entry.supplierInvoiceNumber,
            entry.notes,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(search);
        })
      : purchaseReceiptEntries;

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
      dateRange,
    });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch receipt entries', 500);
  }
}
