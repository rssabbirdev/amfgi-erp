# API HR, Materials, and Upload

> 102 nodes · cohesion 0.02

## Key Concepts

- **POST()** (216 connections) — `app/api/warehouses/route.ts`
- **route.ts** (4 connections) — `app/api/integrations/jobs/upsert/route.ts`
- **readApiKey()** (4 connections) — `app/api/integrations/jobs/upsert/route.ts`
- **readIdempotencyKey()** (4 connections) — `app/api/integrations/jobs/upsert/route.ts`
- **loadVariationJob()** (4 connections) — `app/api/jobs/[id]/items/route.ts`
- **route.ts** (4 connections) — `app/api/integrations/jobs/upsert/route.ts`
- **parseRequestBody()** (3 connections) — `app/api/integrations/jobs/upsert/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/items/route.ts`
- **sanitizeFileName()** (3 connections) — `app/api/upload/material-asset/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/items/route.ts`
- **route.ts** (2 connections) — `app/api/categories/route.ts`
- **route.ts** (2 connections) — `app/api/company-profiles/route.ts`
- **route.ts** (2 connections) — `app/api/hr/employees/route.ts`
- **route.ts** (2 connections) — `app/api/hr/employees/[id]/documents/route.ts`
- **route.ts** (2 connections) — `app/api/hr/employees/[id]/visa-periods/route.ts`
- **route.ts** (2 connections) — `app/api/hr/expertises/route.ts`
- **route.ts** (2 connections) — `app/api/hr/schedule/route.ts`
- **route.ts** (2 connections) — `app/api/job-costing/formulas/route.ts`
- **route.ts** (2 connections) — `app/api/jobs/route.ts`
- **route.ts** (2 connections) — `app/api/roles/route.ts`
- **route.ts** (2 connections) — `app/api/stock-count-sessions/route.ts`
- **route.ts** (2 connections) — `app/api/transactions/route.ts`
- **route.ts** (2 connections) — `app/api/units/route.ts`
- **route.ts** (2 connections) — `app/api/upload/material-asset/route.ts`
- **route.ts** (2 connections) — `app/api/users/route.ts`
- *... and 77 more nodes in this community*

## Relationships

- [[API Reports, Materials, and HR]] (40 shared connections)
- [[API HR, Jobs, and Materials]] (14 shared connections)
- [[API HR, User, and Jobs]] (9 shared connections)
- [[Lib Utils]] (9 shared connections)
- [[Lib Utils and Job Costing]] (8 shared connections)
- [[Lib Integrations, Party Lists API, and Party List Sync]] (7 shared connections)
- [[API Settings, Companies, and Materials]] (6 shared connections)
- [[Lib Integrations and Party Contacts]] (6 shared connections)
- [[API Transactions and Upload]] (5 shared connections)
- [[Lib Utils, HR, and Material Master Data]] (5 shared connections)
- [[Lib HR]] (4 shared connections)
- [[Lib Utils, Media, and Db]] (4 shared connections)

## Source Files

- `app/api/categories/route.ts`
- `app/api/companies/route.ts`
- `app/api/company-profiles/route.ts`
- `app/api/customers/route.ts`
- `app/api/customers/sync/route.ts`
- `app/api/hr/documents/[id]/upload-file/route.ts`
- `app/api/hr/employees/[id]/documents/route.ts`
- `app/api/hr/employees/[id]/upload-photo/route.ts`
- `app/api/hr/employees/[id]/visa-periods/route.ts`
- `app/api/hr/employees/route.ts`
- `app/api/hr/expertises/route.ts`
- `app/api/hr/schedule/[id]/generate-attendance/route.ts`
- `app/api/hr/schedule/[id]/import-csv/route.ts`
- `app/api/hr/schedule/[id]/import-xlsx/route.ts`
- `app/api/hr/schedule/[id]/lock/route.ts`
- `app/api/hr/schedule/[id]/publish/route.ts`
- `app/api/hr/schedule/route.ts`
- `app/api/integrations/customers/upsert/route.ts`
- `app/api/integrations/jobs/upsert/route.ts`
- `app/api/integrations/suppliers/upsert/route.ts`

## Audit Trail

- EXTRACTED: 302 (80%)
- INFERRED: 74 (20%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*