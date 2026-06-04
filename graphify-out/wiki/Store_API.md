# Store API

> 16 nodes · cohesion 0.15

## Key Concepts

- **customers.ts** (16 connections) — `store/api/endpoints/customers.ts`
- **suppliers.ts** (16 connections) — `store/api/endpoints/suppliers.ts`
- **exportCustomers.ts** (8 connections) — `lib/import-export/exportCustomers.ts`
- **Customer** (4 connections) — `store/api/endpoints/customers.ts`
- **exportCustomersToXlsx()** (3 connections) — `lib/import-export/exportCustomers.ts`
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

- [[Lib Import Export and Party List Record Payload]] (7 shared connections)
- [[Stock Job Budget, Daily Quantity Log, and Integrity]] (4 shared connections)
- [[Store API]] (4 shared connections)
- [[Lib Import Export and HR]] (3 shared connections)
- [[Lib, Components, and Suppliers]] (3 shared connections)
- [[Components, Customers, and Lib]] (2 shared connections)
- [[Components Stock]] (2 shared connections)

## Source Files

- `lib/import-export/exportCustomers.ts`
- `store/api/endpoints/customers.ts`
- `store/api/endpoints/suppliers.ts`

## Audit Trail

- EXTRACTED: 61 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*