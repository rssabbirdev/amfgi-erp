import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    // Find the highest delivery note number in the notes field of transactions
    // Notes field contains "--- DELIVERY NOTE #<number>" format
    const transactions = await prisma.transaction.findMany({
      where: {
        companyId: session.user.activeCompanyId,
        type: 'STOCK_OUT',
        notes: {
          contains: '--- DELIVERY NOTE #',
        },
      },
      select: { notes: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    let nextNumber = 1;

    if (transactions.length > 0 && transactions[0].notes) {
      // Extract the last delivery note number
      const match = transactions[0].notes.match(/--- DELIVERY NOTE #(\d+)/);
      if (match && match[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return successResponse({ nextNumber });
  } catch (err: any) {
    console.error('Error getting next delivery note number:', err);
    return errorResponse('Failed to get delivery note number', 500);
  }
}
