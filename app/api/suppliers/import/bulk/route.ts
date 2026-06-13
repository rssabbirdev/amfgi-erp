import { auth } from '@/auth';
import { canImportSuppliers } from '@/lib/auth/supplierAccess';
import { prisma } from '@/lib/db/prisma';
import { runSupplierBulkImport } from '@/lib/import-export/runSupplierBulkImport';
import type { SupplierImportRow } from '@/lib/import-export/supplierFields';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { partyListPartyFieldsSchema } from '@/lib/partyListRecordPayload';
import { formatZodImportError } from '@/lib/import-export/formatImportErrors';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const SupplierImportRowSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).max(100),
    contactPerson: z.string().max(100).optional(),
    phone: z.string().max(50).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .merge(partyListPartyFieldsSchema);

const BulkSchema = z.object({
  newRows: z.array(SupplierImportRowSchema),
  updateRows: z.array(SupplierImportRowSchema),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canImportSuppliers(session.user)) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const body = await req.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(formatZodImportError(parsed.error, 'Supplier import'), 422);
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { supplierSourceMode: true },
  });
  if (!company) return errorResponse('Company not found', 404);

  const normalize = (row: z.infer<typeof SupplierImportRowSchema>): SupplierImportRow => ({
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    country: row.country,
    isActive: row.isActive,
    trade_license_number: row.trade_license_number,
    trade_license_authority: row.trade_license_authority,
    trade_license_expiry: row.trade_license_expiry,
    trn_number: row.trn_number,
    trn_expiry: row.trn_expiry,
    contacts: row.contacts,
  });

  try {
    const result = await runSupplierBulkImport(prisma, {
      companyId,
      supplierSourceMode: company.supplierSourceMode,
      newRows: parsed.data.newRows.map(normalize),
      updateRows: parsed.data.updateRows.map(normalize),
    });

    if (result.created > 0 || result.updated > 0) {
      publishLiveUpdate({
        companyId,
        channel: 'suppliers',
        entity: 'supplier',
        action: 'bulk_import',
      });
    }

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Supplier import failed';
    if (message.includes('Unique constraint')) {
      return errorResponse('A supplier name already exists for this company', 409);
    }
    return errorResponse(message, 500);
  }
}
