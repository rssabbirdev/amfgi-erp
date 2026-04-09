/**
 * Inter-company transfer endpoint.
 * Atomically deducts stock from the source company and credits the destination company.
 * Uses Prisma $transaction for atomicity across both operations.
 * If the destination credit fails, the entire transaction is rolled back automatically.
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const TransferSchema = z.object({
  sourceCompanyId: z.string().optional(),
  destinationCompanyId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().min(0.001),
  notes: z.string().max(500).optional(),
  date: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.transfer')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = TransferSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const { sourceCompanyId, destinationCompanyId, materialId, quantity, notes, date } = parsed.data;
  const txDate = date ? new Date(date) : new Date();

  // Use provided sourceCompanyId if given, otherwise default to activeCompanyId
  const srcCompanyId = sourceCompanyId || session.user.activeCompanyId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get source company
      const srcCompany = await tx.company.findUnique({
        where: { id: srcCompanyId },
      });
      if (!srcCompany) throw new Error('Source company not found');

      // Get destination company
      const destCompany = await tx.company.findUnique({
        where: { id: destinationCompanyId },
      });
      if (!destCompany) throw new Error('Destination company not found');
      if (!destCompany.isActive) throw new Error('Destination company is inactive');

      if (srcCompanyId === destinationCompanyId) {
        throw new Error('Source and destination cannot be the same');
      }

      // Check source material exists and has sufficient stock
      const srcMaterial = await tx.material.findUnique({
        where: { id: materialId },
      });
      if (!srcMaterial) throw new Error('Material not found in source company');
      if (srcCompany.id !== srcMaterial.companyId) {
        throw new Error('Material does not belong to source company');
      }
      if (srcMaterial.currentStock < quantity) {
        throw new Error(`Insufficient stock. Available: ${srcMaterial.currentStock} ${srcMaterial.unit}`);
      }

      // Find or create matching material in destination by name + unit
      let destMaterial = await tx.material.findFirst({
        where: {
          companyId: destinationCompanyId,
          name: srcMaterial.name,
          unit: srcMaterial.unit,
        },
      });

      if (!destMaterial) {
        // Auto-create material in destination company
        destMaterial = await tx.material.create({
          data: {
            companyId: destinationCompanyId,
            name: srcMaterial.name,
            unit: srcMaterial.unit,
            description: srcMaterial.description,
            unitCost: srcMaterial.unitCost,
            category: srcMaterial.category,
            warehouse: srcMaterial.warehouse,
            stockType: srcMaterial.stockType,
            externalItemName: srcMaterial.externalItemName,
            currentStock: 0,
            reorderLevel: srcMaterial.reorderLevel,
            isActive: true,
          },
        });
      }

      const performedBy = session.user.id;

      // Deduct from source
      await tx.material.update({
        where: { id: materialId },
        data: {
          currentStock: {
            decrement: quantity,
          },
        },
      });

      // Create TRANSFER_OUT transaction in source
      await tx.transaction.create({
        data: {
          companyId: srcCompanyId,
          type: 'TRANSFER_OUT',
          materialId,
          quantity,
          counterpartCompany: destCompany.slug,
          notes: notes || null,
          date: txDate,
          performedBy,
        },
      });

      // Credit destination
      await tx.material.update({
        where: { id: destMaterial.id },
        data: {
          currentStock: {
            increment: quantity,
          },
        },
      });

      // Create TRANSFER_IN transaction in destination
      await tx.transaction.create({
        data: {
          companyId: destinationCompanyId,
          type: 'TRANSFER_IN',
          materialId: destMaterial.id,
          quantity,
          counterpartCompany: srcCompany.slug,
          notes: notes || null,
          date: txDate,
          performedBy,
        },
      });

      return {
        transferredQty: quantity,
        materialName: srcMaterial.name,
        sourceCompany: srcCompany.slug,
        destinationCompany: destCompany.slug,
        destMaterialId: destMaterial.id,
      };
    });

    return successResponse(result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Transfer failed';
    return errorResponse(message, 400);
  }
}
