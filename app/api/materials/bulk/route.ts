import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  MATERIAL_BULK_IMPORT_MAX_ROWS,
  runMaterialBulkImport,
} from '@/lib/import-export/runMaterialBulkImport';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

export const maxDuration = 60;

const MaterialRowSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  unit: z.string().min(1).max(20),
  category: z.string().max(100).optional(),
  categoryId: z.string().max(100).optional(),
  warehouse: z.string().max(100).optional(),
  warehouseId: z.string().max(100).optional(),
  stockType: z.string().min(1).max(50),
  allowNegativeConsumption: z.boolean().optional(),
  assemblyUseDynamicCost: z.boolean().optional(),
  externalItemName: z.string().max(100).optional(),
  unitCost: z.number().finite().min(0).optional(),
  reorderLevel: z.number().finite().min(0).optional(),
  currentStock: z.number().finite().min(0).optional(),
});

const BulkSchema = z.object({
  newRows: z.array(MaterialRowSchema),
  updateRows: z.array(MaterialRowSchema),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.create')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const { newRows, updateRows } = parsed.data;
  if (newRows.length + updateRows.length > MATERIAL_BULK_IMPORT_MAX_ROWS) {
    return errorResponse(
      `Too many rows in one request (max ${MATERIAL_BULK_IMPORT_MAX_ROWS}). The import UI sends smaller batches automatically.`,
      422
    );
  }

  const companyId = session.user.activeCompanyId;

  try {
    const result = await runMaterialBulkImport(prisma, {
      companyId,
      newRows,
      updateRows,
    });

    if (result.created > 0 || result.updated > 0) {
      publishLiveUpdate({
        companyId,
        channel: 'stock',
        entity: 'material',
        action: result.created > 0 && result.updated > 0 ? 'changed' : result.created > 0 ? 'created' : 'updated',
      });
    }

    return successResponse(result);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Bulk operation failed', 400);
  }
}
