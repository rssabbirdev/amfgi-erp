import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.transfer')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;

  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] },
    },
    include: {
      material: {
        select: {
          id: true,
          name: true,
          unit: true,
        },
      },
      warehouse: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  });

  const counterpartSlugs = [...new Set(transactions.map((transaction) => transaction.counterpartCompany).filter(Boolean))];
  const counterpartCompanies = counterpartSlugs.length
    ? await prisma.company.findMany({
        where: { slug: { in: counterpartSlugs as string[] } },
        select: { slug: true, name: true },
      })
    : [];

  const counterpartNameBySlug = new Map(counterpartCompanies.map((company) => [company.slug, company.name]));

  return successResponse(
    transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      direction: transaction.type === 'TRANSFER_IN' ? 'IN' : 'OUT',
      materialId: transaction.materialId,
      materialName: transaction.material.name,
      unit: transaction.material.unit,
      quantity: transaction.quantity,
      warehouseId: transaction.warehouse?.id ?? null,
      warehouseName: transaction.warehouse?.name ?? null,
      counterpartCompanySlug: transaction.counterpartCompany,
      counterpartCompanyName: transaction.counterpartCompany
        ? counterpartNameBySlug.get(transaction.counterpartCompany) ?? transaction.counterpartCompany
        : null,
      notes: transaction.notes,
      date: transaction.date,
      createdAt: transaction.createdAt,
      performedBy: transaction.performedByName ?? transaction.performedBy,
    }))
  );
}
