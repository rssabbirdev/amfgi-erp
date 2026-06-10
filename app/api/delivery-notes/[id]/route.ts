import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { serializeJobWithContacts } from '@/lib/jobs/jobContacts';
import { jobForPrintSelect } from '@/lib/jobs/jobPrintSelect';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const perms = (session.user.permissions ?? []) as string[];
  const canRead =
    session.user.isSuperAdmin ||
    perms.includes('transaction.stock_out') ||
    perms.includes('settings.manage');
  if (!canRead) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  if (!id?.trim()) return errorResponse('Delivery note id is required', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const dn = await prisma.deliveryNote.findFirst({
      where: { id: id.trim(), companyId },
      include: {
        job: { select: jobForPrintSelect },
        transactions: {
          where: { type: 'STOCK_OUT' },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!dn) return errorResponse('Delivery note not found', 404);

    const serializedJob = dn.job ? serializeJobWithContacts(dn.job) : null;

    return successResponse({
      id: dn.id,
      number: dn.number,
      jobId: dn.jobId,
      date: dn.date,
      documentNotes: dn.documentNotes ?? null,
      customItemsJson: dn.customItemsJson ?? null,
      materialDispatchSkipped: dn.materialDispatchSkipped,
      job: serializedJob,
      firstStockOutTransactionId: dn.transactions[0]?.id ?? null,
    });
  } catch (err: unknown) {
    console.error('delivery-notes GET:', err);
    return errorResponse('Failed to load delivery note', 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  if (!id?.trim()) return errorResponse('Delivery note id is required', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const row = await prisma.deliveryNote.findFirst({
      where: { id: id.trim(), companyId },
      select: { id: true },
    });
    if (!row) return errorResponse('Delivery note not found', 404);

    const linked = await prisma.transaction.count({
      where: { companyId, deliveryNoteId: row.id },
    });
    if (linked > 0) {
      return errorResponse('Cannot delete a delivery note that still has linked stock transactions', 400);
    }

    await prisma.deliveryNote.delete({
      where: { id: row.id },
    });

    return successResponse({ deleted: true });
  } catch (err: unknown) {
    console.error('delivery-notes DELETE:', err);
    return errorResponse('Failed to delete delivery note', 500);
  }
}
