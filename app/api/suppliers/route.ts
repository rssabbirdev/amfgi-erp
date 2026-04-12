import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  partyListPartyFieldsSchema,
  primaryFromPartyContacts,
  prismaPartyFieldsFromBody,
} from '@/lib/partyListRecordPayload';
import { z } from 'zod';

const CreateSupplierSchema = z
  .object({
    name: z.string().min(1).max(100),
    contactPerson: z.string().max(100).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    phone: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    isActive: z.boolean().default(true),
  })
  .merge(partyListPartyFieldsSchema);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const suppliers = await prisma.supplier.findMany({
      where: {
        companyId: session.user.activeCompanyId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
    return successResponse(suppliers);
  } catch (err) {
    return errorResponse('Failed to fetch suppliers', 500);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const body = await req.json();
    const parsed = CreateSupplierSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
    }

    const p = parsed.data;
    const party = prismaPartyFieldsFromBody(p);
    const fromContacts = primaryFromPartyContacts(p.contacts);
    const contactPersonFallback = p.contactPerson?.trim() || null;
    const phoneFallback = p.phone?.trim() || null;
    const supplier = await prisma.supplier.create({
      data: {
        companyId: session.user.activeCompanyId,
        name: p.name,
        email: p.email?.trim() ? p.email.trim() : null,
        address: p.address?.trim() || null,
        city: p.city?.trim() || null,
        country: p.country?.trim() || null,
        contactPerson: fromContacts.contactPerson ?? contactPersonFallback,
        phone: fromContacts.phone ?? phoneFallback,
        tradeLicenseNumber: party.tradeLicenseNumber,
        tradeLicenseAuthority: party.tradeLicenseAuthority,
        tradeLicenseExpiry: party.tradeLicenseExpiry,
        trnNumber: party.trnNumber,
        trnExpiry: party.trnExpiry,
        contactsJson: party.contactsJson ?? undefined,
        isActive: p.isActive ?? true,
        source: 'LOCAL',
        externalPartyId: null,
      },
    });
    return successResponse(supplier, 201);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create supplier';
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Supplier name already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}
