# Store API

> 18 nodes · cohesion 0.13

## Key Concepts

- **customers.ts** (16 connections) — `store/api/endpoints/customers.ts`
- **suppliers.ts** (16 connections) — `store/api/endpoints/suppliers.ts`
- **exportSuppliers.ts** (8 connections) — `lib/import-export/exportSuppliers.ts`
- **Supplier** (5 connections) — `store/api/endpoints/suppliers.ts`
- **supplierToExportRow()** (4 connections) — `lib/import-export/supplierFields.ts`
- **exportSuppliersToXlsx()** (3 connections) — `lib/import-export/exportSuppliers.ts`
- **contactExportColumns()** (2 connections) — `lib/import-export/supplierFields.ts`
- **PartyRecordSource** (2 connections) — `store/api/endpoints/customers.ts`
- **PartyListSyncResult** (2 connections) — `store/api/endpoints/customers.ts`
- **suppliersApi** (2 connections) — `store/api/endpoints/suppliers.ts`
- **CustomerStatusFilter** (1 connections) — `store/api/endpoints/customers.ts`
- **CustomerFilter** (1 connections) — `store/api/endpoints/customers.ts`
- **CustomersListParams** (1 connections) — `store/api/endpoints/customers.ts`
- **CustomersListResponse** (1 connections) — `store/api/endpoints/customers.ts`
- **customersApi** (1 connections) — `store/api/endpoints/customers.ts`
- **SupplierSourceFilter** (1 connections) — `store/api/endpoints/suppliers.ts`
- **SuppliersListParams** (1 connections) — `store/api/endpoints/suppliers.ts`
- **SuppliersListResponse** (1 connections) — `store/api/endpoints/suppliers.ts`

## Relationships

- [[Lib Import Export]] (6 shared connections)
- [[Lib Import Export, Party Contacts, and Party List Record Payload]] (6 shared connections)
- [[Stock, Components, and Store]] (4 shared connections)
- [[Store API and Slices]] (4 shared connections)
- [[Lib, Components, and Suppliers]] (3 shared connections)
- [[Stock, Lib, and Store]] (3 shared connections)
- [[HR Attendance and Schedule]] (2 shared connections)

## Source Files

- `lib/import-export/exportSuppliers.ts`
- `lib/import-export/supplierFields.ts`
- `store/api/endpoints/customers.ts`
- `store/api/endpoints/suppliers.ts`

## Audit Trail

- EXTRACTED: 68 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*