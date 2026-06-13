import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  buildMaterialTransactionReportQuery,
  buildMaterialTransactionReportRows,
  buildOpeningStockReportRows,
  loadOpeningStockBatches,
  loadPurchaseReceiptLookup,
  mergeMaterialTransactionReportRows,
  materialTransactionReportSelect,
} from '@/lib/materials/materialTransactionReport';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  const companyId = session.user.activeCompanyId;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  try {
    const material = await prisma.material.findFirst({
      where: { id, companyId },
      select: { id: true, name: true, unit: true, externalItemName: true },
    });
    if (!material) return errorResponse('Material not found', 404);

    const { dateFilter, dateRangeLabel } = buildMaterialTransactionReportQuery(from, to);

    const transactions = await prisma.transaction.findMany({
      where: {
        companyId,
        materialId: id,
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      select: materialTransactionReportSelect,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const [purchaseReceiptByNumber, openingStockBatches] = await Promise.all([
      loadPurchaseReceiptLookup(prisma, companyId, transactions),
      loadOpeningStockBatches(prisma, companyId, id, dateFilter),
    ]);
    const transactionRows = buildMaterialTransactionReportRows(transactions, { purchaseReceiptByNumber });
    const openingStockRows = buildOpeningStockReportRows(openingStockBatches, material);
    const rows = mergeMaterialTransactionReportRows(transactionRows, openingStockRows);

    return successResponse({
      material: {
        id: material.id,
        name: material.name,
        unit: material.unit,
        externalItemName: material.externalItemName,
      },
      dateRangeLabel,
      from: from?.trim() || null,
      to: to?.trim() || null,
      rows,
    });
  } catch (error) {
    console.error('[material-transaction-report]', error);
    return errorResponse(error instanceof Error ? error.message : 'Failed to build material report', 500);
  }
}
