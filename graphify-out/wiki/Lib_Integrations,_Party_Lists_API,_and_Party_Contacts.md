# Lib Integrations, Party Lists API, and Party Contacts

> 46 nodes · cohesion 0.07

## Key Concepts

- **partyListsApi.ts** (10 connections) — `lib\partyListsApi.ts`
- **partyContacts.ts** (7 connections) — `lib\partyContacts.ts`
- **serializeCustomerWithContacts()** (6 connections) — `lib\partyContacts.ts`
- **serializeSupplierWithContacts()** (6 connections) — `lib\partyContacts.ts`
- **partyListRecordPayload.ts** (6 connections) — `lib\partyListRecordPayload.ts`
- **primaryFromPartyContacts()** (6 connections) — `lib\partyListRecordPayload.ts`
- **prismaPartyFieldsFromBody()** (6 connections) — `lib\partyListRecordPayload.ts`
- **partyUpsertService.ts** (6 connections) — `lib\integrations\partyUpsertService.ts`
- **processCustomerUpsert()** (6 connections) — `lib\integrations\partyUpsertService.ts`
- **processSupplierUpsert()** (6 connections) — `lib\integrations\partyUpsertService.ts`
- **applyPartialPartyFieldsToUpdate()** (5 connections) — `lib\partyListRecordPayload.ts`
- **getPartyListsApiConfig()** (5 connections) — `lib\partyListsApi.ts`
- **parsePartyListDateInput()** (5 connections) — `lib\partyListsApi.ts`
- **fetchPartyListArray()** (5 connections) — `lib\partyListsApi.ts`
- **syncExternalCustomersForCompany()** (5 connections) — `lib\partyListSync.ts`
- **jobSyncService.ts** (5 connections) — `lib\integrations\jobSyncService.ts`
- **basePartyData()** (5 connections) — `lib\integrations\partyUpsertService.ts`
- **strOrNull()** (4 connections) — `lib\partyListRecordPayload.ts`
- **fetchExternalClients()** (4 connections) — `lib\partyListsApi.ts`
- **fetchExternalSuppliers()** (4 connections) — `lib\partyListsApi.ts`
- **upsertPartyListRows()** (4 connections) — `lib\partyListSync.ts`
- **syncExternalSuppliersForCompany()** (4 connections) — `lib\partyListSync.ts`
- **normalizePartyContactsInput()** (3 connections) — `lib\partyContacts.ts`
- **serializePartyContacts()** (3 connections) — `lib\partyContacts.ts`
- **sortContacts()** (3 connections) — `lib\partyListRecordPayload.ts`
- *... and 21 more nodes in this community*

## Relationships

- [[API HR, Materials, and Transactions]] (14 shared connections)
- [[HR, Components, and Print]] (5 shared connections)
- [[Lib, Scripts, and Profile]] (3 shared connections)

## Source Files

- `lib\integrations\jobSyncService.ts`
- `lib\integrations\partyUpsertService.ts`
- `lib\partyContacts.ts`
- `lib\partyListRecordPayload.ts`
- `lib\partyListSync.ts`
- `lib\partyListsApi.ts`

## Audit Trail

- EXTRACTED: 128 (75%)
- INFERRED: 42 (25%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*