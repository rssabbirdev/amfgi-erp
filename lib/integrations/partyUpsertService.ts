import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import {
  partyListContactSchema,
  partyListPartyFieldsSchema,
  primaryFromPartyContacts,
  prismaPartyFieldsFromBody,
} from '@/lib/partyListRecordPayload';
import {
  serializeCustomerWithContacts,
  serializeSupplierWithContacts,
  syncCustomerContacts,
  syncSupplierContacts,
} from '@/lib/partyContacts';

export class PartySyncConflictError extends Error {
  override name = 'PartySyncConflictError';
  constructor(message: string) {
    super(message);
  }
}

const externalPartyIdSchema = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number' && Number.isInteger(val) && val > 0) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return undefined;
    if (!/^\d+$/.test(t)) return Number.NaN;
    const n = Number.parseInt(t, 10);
    return n > 0 && n <= 2_147_483_647 ? n : Number.NaN;
  }
  return Number.NaN;
}, z.number().int().positive().max(2_147_483_647).optional());

const BasePartySchema = z
  .object({
    externalPartyId: externalPartyIdSchema,
    name: z.string().min(1).max(200),
    contactPerson: z.string().max(200).optional(),
    phone: z.string().max(60).optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().max(2000).optional(),
    isActive: z.boolean().optional(),
    contacts: z.array(partyListContactSchema).optional(),
  })
  .merge(partyListPartyFieldsSchema);

export const UpsertCustomerSchema = z.object({
  companyExternalId: z.string().min(1).max(120),
  customer: BasePartySchema,
});

export const UpsertSupplierSchema = z.object({
  companyExternalId: z.string().min(1).max(120),
  supplier: BasePartySchema.extend({
    city: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
  }),
});

type CustomerPayload = z.infer<typeof UpsertCustomerSchema>['customer'];
type SupplierPayload = z.infer<typeof UpsertSupplierSchema>['supplier'];

function basePartyData(payload: CustomerPayload | SupplierPayload) {
  const partyFields = prismaPartyFieldsFromBody(payload);
  const primary = primaryFromPartyContacts(payload.contacts);
  return {
    name: payload.name.trim(),
    contactPerson: primary.contactPerson ?? payload.contactPerson?.trim() ?? null,
    phone: primary.phone ?? payload.phone?.trim() ?? null,
    email: payload.email?.trim() || null,
    address: payload.address?.trim() || null,
    isActive: payload.isActive ?? true,
    source: 'PARTY_API_SYNC' as const,
    externalPartyId: payload.externalPartyId ?? null,
    externalSyncedAt: new Date(),
    tradeLicenseNumber: partyFields.tradeLicenseNumber,
    tradeLicenseAuthority: partyFields.tradeLicenseAuthority,
    tradeLicenseExpiry: partyFields.tradeLicenseExpiry,
    trnNumber: partyFields.trnNumber,
    trnExpiry: partyFields.trnExpiry,
    contacts: partyFields.contacts,
  };
}

async function findCustomerForUpsert(companyId: string, payload: CustomerPayload) {
  if (payload.externalPartyId !== undefined) {
    const byExternal = await prisma.customer.findUnique({
      where: { companyId_externalPartyId: { companyId, externalPartyId: payload.externalPartyId } },
      select: { id: true },
    });
    if (byExternal) return byExternal;
  }

  const byName = await prisma.customer.findFirst({
    where: { companyId, name: payload.name.trim() },
    select: { id: true, externalPartyId: true },
  });
  if (byName?.externalPartyId != null && payload.externalPartyId !== undefined && byName.externalPartyId !== payload.externalPartyId) {
    throw new PartySyncConflictError('customer name is already linked to a different externalPartyId');
  }
  return byName;
}

async function findSupplierForUpsert(companyId: string, payload: SupplierPayload) {
  if (payload.externalPartyId !== undefined) {
    const byExternal = await prisma.supplier.findUnique({
      where: { companyId_externalPartyId: { companyId, externalPartyId: payload.externalPartyId } },
      select: { id: true },
    });
    if (byExternal) return byExternal;
  }

  const byName = await prisma.supplier.findFirst({
    where: { companyId, name: payload.name.trim() },
    select: { id: true, externalPartyId: true },
  });
  if (byName?.externalPartyId != null && payload.externalPartyId !== undefined && byName.externalPartyId !== payload.externalPartyId) {
    throw new PartySyncConflictError('supplier name is already linked to a different externalPartyId');
  }
  return byName;
}

export async function processCustomerUpsert(params: {
  companyId: string;
  credentialId: string;
  payload: CustomerPayload;
}) {
  const existing = await findCustomerForUpsert(params.companyId, params.payload);
  const data = basePartyData(params.payload);
  const customer = await prisma.$transaction(async (tx) => {
    const record = existing
      ? await tx.customer.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            contactPerson: data.contactPerson,
            phone: data.phone,
            email: data.email,
            address: data.address,
            isActive: data.isActive,
            source: data.source,
            externalPartyId: data.externalPartyId,
            externalSyncedAt: data.externalSyncedAt,
            tradeLicenseNumber: data.tradeLicenseNumber,
            tradeLicenseAuthority: data.tradeLicenseAuthority,
            tradeLicenseExpiry: data.tradeLicenseExpiry,
            trnNumber: data.trnNumber,
            trnExpiry: data.trnExpiry,
          },
        })
      : await tx.customer.create({
          data: {
            companyId: params.companyId,
            name: data.name,
            contactPerson: data.contactPerson,
            phone: data.phone,
            email: data.email,
            address: data.address,
            isActive: data.isActive,
            source: data.source,
            externalPartyId: data.externalPartyId,
            externalSyncedAt: data.externalSyncedAt,
            tradeLicenseNumber: data.tradeLicenseNumber,
            tradeLicenseAuthority: data.tradeLicenseAuthority,
            tradeLicenseExpiry: data.tradeLicenseExpiry,
            trnNumber: data.trnNumber,
            trnExpiry: data.trnExpiry,
          },
        });
    await syncCustomerContacts(tx, {
      companyId: params.companyId,
      customerId: record.id,
      contacts: data.contacts,
    });
    return tx.customer.findUniqueOrThrow({
      where: { id: record.id },
      include: {
        contacts: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  });
  await prisma.apiCredential.update({ where: { id: params.credentialId }, data: { lastUsedAt: new Date() } });
  return { created: !existing, customer: serializeCustomerWithContacts(customer) };
}

export async function processSupplierUpsert(params: {
  companyId: string;
  credentialId: string;
  payload: SupplierPayload;
}) {
  const existing = await findSupplierForUpsert(params.companyId, params.payload);
  const data = {
    ...basePartyData(params.payload),
    city: params.payload.city?.trim() || null,
    country: params.payload.country?.trim() || null,
  };
  const supplier = await prisma.$transaction(async (tx) => {
    const record = existing
      ? await tx.supplier.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            contactPerson: data.contactPerson,
            phone: data.phone,
            email: data.email,
            address: data.address,
            city: data.city,
            country: data.country,
            isActive: data.isActive,
            source: data.source,
            externalPartyId: data.externalPartyId,
            externalSyncedAt: data.externalSyncedAt,
            tradeLicenseNumber: data.tradeLicenseNumber,
            tradeLicenseAuthority: data.tradeLicenseAuthority,
            tradeLicenseExpiry: data.tradeLicenseExpiry,
            trnNumber: data.trnNumber,
            trnExpiry: data.trnExpiry,
          },
        })
      : await tx.supplier.create({
          data: {
            companyId: params.companyId,
            name: data.name,
            contactPerson: data.contactPerson,
            phone: data.phone,
            email: data.email,
            address: data.address,
            city: data.city,
            country: data.country,
            isActive: data.isActive,
            source: data.source,
            externalPartyId: data.externalPartyId,
            externalSyncedAt: data.externalSyncedAt,
            tradeLicenseNumber: data.tradeLicenseNumber,
            tradeLicenseAuthority: data.tradeLicenseAuthority,
            tradeLicenseExpiry: data.tradeLicenseExpiry,
            trnNumber: data.trnNumber,
            trnExpiry: data.trnExpiry,
          },
        });
    await syncSupplierContacts(tx, {
      companyId: params.companyId,
      supplierId: record.id,
      contacts: data.contacts,
    });
    return tx.supplier.findUniqueOrThrow({
      where: { id: record.id },
      include: {
        contacts: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  });
  await prisma.apiCredential.update({ where: { id: params.credentialId }, data: { lastUsedAt: new Date() } });
  return { created: !existing, supplier: serializeSupplierWithContacts(supplier) };
}
