import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { serializeCustomerWithContacts, syncCustomerContacts } from '@/lib/partyContacts';
import {
  partyListPartyFieldsSchema,
  primaryFromPartyContacts,
  prismaPartyFieldsFromBody,
} from '@/lib/partyListRecordPayload';
import { z } from 'zod';

/** Body matches party lists API field names for license/TRN/contacts; see API-party-lists.md */
const CustomerSchema = z
  .object({
    name: z.string().min(1).max(100),
    contactPerson: z.string().max(100).optional(),
    phone: z.string().max(30).optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    address: z.string().max(500).optional(),
  })
  .merge(partyListPartyFieldsSchema);

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const customers = await prisma.customer.findMany({
    where: {
      companyId,
    },
    orderBy: { name: 'asc' },
    include: {
      contacts: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  return successResponse(customers.map(serializeCustomerWithContacts));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.create')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const body = await req.json();
  const parsed = CustomerSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const p = parsed.data;
    const party = prismaPartyFieldsFromBody(p);
    const fromContacts = primaryFromPartyContacts(p.contacts);
    const contactPersonFallback = p.contactPerson?.trim() || null;
    const phoneFallback = p.phone?.trim() || null;
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          companyId,
          name: p.name,
          email: p.email?.trim() ? p.email.trim() : null,
          address: p.address?.trim() || null,
          contactPerson: fromContacts.contactPerson ?? contactPersonFallback,
          phone: fromContacts.phone ?? phoneFallback,
          tradeLicenseNumber: party.tradeLicenseNumber,
          tradeLicenseAuthority: party.tradeLicenseAuthority,
          tradeLicenseExpiry: party.tradeLicenseExpiry,
          trnNumber: party.trnNumber,
          trnExpiry: party.trnExpiry,
          isActive: true,
          source: 'LOCAL',
          externalPartyId: null,
        },
      });
      await syncCustomerContacts(tx, {
        companyId,
        customerId: created.id,
        contacts: party.contacts,
      });
      return tx.customer.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
    return successResponse(serializeCustomerWithContacts(customer), 201);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create customer';
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Customer name already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}
