import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { parseListLimit } from '@/lib/pagination/serverList';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

/** List delivery notes for dispatch history and print-template preview pickers. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const perms = (session.user.permissions ?? []) as string[];
  const isSA = session.user.isSuperAdmin ?? false;
  const canList =
    isSA || perms.includes('settings.manage') || perms.includes('transaction.stock_out');
  if (!canList) return errorResponse('Forbidden', 403);

  const companyId = session.user.activeCompanyId;
  const limit = parseListLimit(new URL(req.url).searchParams.get('limit'));

  const rows = await prisma.deliveryNote.findMany({
    where: { companyId },
    orderBy: [{ date: 'desc' }, { number: 'desc' }],
    take: limit,
    select: {
      id: true,
      number: true,
      date: true,
      deliveryType: true,
      materialDispatchSkipped: true,
      job: { select: { jobNumber: true } },
      materialLines: { select: { id: true } },
      transactions: {
        where: { type: 'STOCK_OUT' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return successResponse({
    entries: rows.map((dn) => ({
      deliveryNoteId: dn.id,
      entryId: dn.id,
      deliveryNoteNumber: dn.number,
      jobNumber: dn.job?.jobNumber ?? '—',
      deliveryType: dn.deliveryType,
      dispatchDate: dn.date,
      transactionIds: dn.transactions.map((t) => t.id),
      materialsCount:
        dn.deliveryType === 'SUBCONTRACT' ? dn.materialLines.length : dn.transactions.length,
      isPrintOnly: dn.materialDispatchSkipped,
      isDeliveryNote: true,
    })),
  });
}
