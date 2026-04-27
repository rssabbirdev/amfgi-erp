import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalEqualsNullable, decimalToNumber } from '@/lib/utils/decimal';
import { z } from 'zod';

const PriceLogSchema = z.object({
  materialId: z.string().min(1),
  previousPrice: z.number().finite().min(0),
  currentPrice: z.number().finite().min(0),
  source: z.enum(['manual', 'bill']),
  billId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = PriceLogSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  // Only create log if prices are different
  if (decimalEqualsNullable(parsed.data.previousPrice, parsed.data.currentPrice)) {
    return successResponse({ skipped: true }, 200);
  }

  try {
    // Verify material exists and belongs to this company
    const material = await prisma.material.findUnique({
      where: { id: parsed.data.materialId },
    });
    if (!material || material.companyId !== session.user.activeCompanyId) {
      return errorResponse('Material not found', 404);
    }

    const log = await prisma.priceLog.create({
      data: {
        companyId: session.user.activeCompanyId,
        materialId: parsed.data.materialId,
        previousPrice: decimalToNumber(parsed.data.previousPrice) ?? 0,
        currentPrice: decimalToNumber(parsed.data.currentPrice) ?? 0,
        source: parsed.data.source,
        changedBy: session.user.name || session.user.email || session.user.id,
        billId: parsed.data.billId,
        notes: parsed.data.notes,
      },
    });

    return successResponse(log, 201);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create price log', 400);
  }
}
