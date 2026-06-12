import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { heavyTransactionOptions } from '@/lib/db/transactionOptions';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { receiveSubcontractDeliveryNote } from '@/lib/stock/subcontractDeliveryNote';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const ReceiveSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        receiveQty: z.number().finite().min(0.001),
        destinationWarehouseId: z.string().min(1).optional(),
      })
    )
    .min(1),
  notes: z.string().max(20000).optional(),
  date: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id } = await params;
  if (!id?.trim()) return errorResponse('Delivery note id is required', 400);

  const body = await req.json();
  const parsed = ReceiveSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const companyId = session.user.activeCompanyId;
  const txDate = parsed.data.date ? new Date(parsed.data.date) : new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const dn = await tx.deliveryNote.findFirst({
        where: { id: id.trim(), companyId },
        select: { id: true, deliveryType: true, number: true },
      });
      if (!dn) throw new Error('Delivery note not found');
      if (dn.deliveryType !== 'SUBCONTRACT') {
        throw new Error('Only subcontract delivery notes can receive material');
      }

      return receiveSubcontractDeliveryNote(tx, {
        companyId,
        deliveryNoteId: dn.id,
        lines: parsed.data.lines,
        notes: parsed.data.notes,
        date: txDate,
        sessionUser: session.user,
      });
    }, heavyTransactionOptions);

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'delivery_note',
      action: 'changed',
    });

    return successResponse({
      deliveryNoteId: id.trim(),
      ...result,
    });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to receive subcontract material', 400);
  }
}
