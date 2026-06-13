import { auth } from '@/auth';
import {
  canCreateSuppliers,
  canViewSuppliers,
} from '@/lib/auth/supplierAccess';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { serializeSupplierWithContacts, syncSupplierContacts } from '@/lib/partyContacts';
import {
  partyListPartyFieldsSchema,
  primaryFromPartyContacts,
  prismaPartyFieldsFromBody,
} from '@/lib/partyListRecordPayload';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
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

function buildSupplierListWhere(
  companyId: string,
  opts: {
    includeInactive: boolean;
    search: string;
    source: string | null;
  },
) {
  const where: {
    companyId: string;
    isActive?: boolean;
    source?: { not: 'PARTY_API_SYNC' } | 'PARTY_API_SYNC';
    OR?: Array<Record<string, unknown>>;
  } = {
    companyId,
    ...(opts.includeInactive ? {} : { isActive: true }),
  };

  if (opts.source === 'local') where.source = { not: 'PARTY_API_SYNC' };
  if (opts.source === 'synced') where.source = 'PARTY_API_SYNC';

  if (opts.search) {
    const searchOr: Array<Record<string, unknown>> = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { email: { contains: opts.search, mode: 'insensitive' } },
      { contactPerson: { contains: opts.search, mode: 'insensitive' } },
      { phone: { contains: opts.search, mode: 'insensitive' } },
    ];
    const externalId = Number.parseInt(opts.search, 10);
    if (Number.isFinite(externalId)) {
      searchOr.push({ externalPartyId: externalId });
    }
    where.OR = searchOr;
  }

  return where;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canViewSuppliers(session.user)) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get('includeInactive') === 'true';
  const limitParam = searchParams.get('limit');

  try {
    if (limitParam !== null) {
      const limit = parseListLimit(limitParam);
      const offset = parseListOffset(searchParams.get('offset'));
      const search = searchParams.get('search')?.trim() ?? '';
      const source = searchParams.get('source');

      const where = buildSupplierListWhere(companyId, {
        includeInactive,
        search,
        source,
      });

      const [total, suppliers] = await Promise.all([
        prisma.supplier.count({ where }),
        prisma.supplier.findMany({
          where,
          orderBy: { name: 'asc' },
          skip: offset,
          take: limit,
          include: {
            contacts: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        }),
      ]);

      return successResponse({
        items: suppliers.map(serializeSupplierWithContacts),
        total,
      });
    }

    const suppliers = await prisma.supplier.findMany({
      where: {
        companyId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
      include: {
        contacts: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    return successResponse(suppliers.map(serializeSupplierWithContacts));
  } catch (err) {
    return errorResponse('Failed to fetch suppliers', 500);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!canCreateSuppliers(session.user)) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);
  const companyId = session.user.activeCompanyId;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { supplierSourceMode: true },
  });
  if (company?.supplierSourceMode === 'EXTERNAL_ONLY') {
    return errorResponse(
      'Manual supplier creation is disabled. This company is set to external-only suppliers (use the integration API or party lists sync).',
      403
    );
  }

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
    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          companyId,
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
          isActive: p.isActive ?? true,
          source: 'LOCAL',
          externalPartyId: null,
        },
      });
      await syncSupplierContacts(tx, {
        companyId,
        supplierId: created.id,
        contacts: party.contacts,
      });
      return tx.supplier.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          contacts: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
    publishLiveUpdate({
      companyId,
      channel: 'suppliers',
      entity: 'supplier',
      action: 'created',
    });
    return successResponse(serializeSupplierWithContacts(supplier), 201);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create supplier';
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Supplier name already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}
