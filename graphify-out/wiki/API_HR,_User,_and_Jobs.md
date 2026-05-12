# API HR, User, and Jobs

> 36 nodes · cohesion 0.08

## Key Concepts

- **PATCH()** (35 connections) — `app/api/user/profile/route.ts`
- **serializeSnapshotMeta()** (8 connections) — `app/api/jobs/[id]/cost-engine/snapshots/[snapshotId]/route.ts`
- **requirePerm()** (8 connections) — `lib/hr/requireCompanySession.ts`
- **resolveJobBudgetContext()** (8 connections) — `lib/job-costing/budgetJobContext.ts`
- **parseDt()** (6 connections) — `app/api/hr/attendance/[id]/route.ts`
- **diffMinutes()** (6 connections) — `app/api/hr/attendance/[id]/route.ts`
- **displayProfileImage()** (5 connections) — `app/api/user/profile/route.ts`
- **displaySignature()** (5 connections) — `app/api/user/profile/route.ts`
- **route.ts** (4 connections) — `app/api/user/profile/route.ts`
- **hasPerm()** (4 connections) — `lib/hr/requireCompanySession.ts`
- **route.ts** (4 connections) — `app/api/user/profile/route.ts`
- **route.ts** (3 connections) — `app/api/hr/attendance/bulk-upsert/route.ts`
- **route.ts** (3 connections) — `app/api/hr/attendance/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/hr/employees/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/cost-engine/snapshots/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/cost-engine/snapshots/[snapshotId]/route.ts`
- **route.ts** (3 connections) — `app/api/hr/attendance/bulk-upsert/route.ts`
- **route.ts** (3 connections) — `app/api/hr/attendance/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/hr/employees/[id]/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/cost-engine/snapshots/route.ts`
- **route.ts** (3 connections) — `app/api/jobs/[id]/cost-engine/snapshots/[snapshotId]/route.ts`
- **requireCompanySession.ts** (3 connections) — `lib/hr/requireCompanySession.ts`
- **route.ts** (2 connections) — `app/api/hr/document-types/[id]/route.ts`
- **route.ts** (2 connections) — `app/api/hr/documents/[id]/route.ts`
- **route.ts** (2 connections) — `app/api/hr/expertises/[id]/route.ts`
- *... and 11 more nodes in this community*

## Relationships

- [[API Reports, Materials, and HR]] (16 shared connections)
- [[API HR, Jobs, and Materials]] (14 shared connections)
- [[API HR, Materials, and Upload]] (9 shared connections)
- [[Lib and API]] (4 shared connections)
- [[API Companies, Materials, and Suppliers]] (3 shared connections)
- [[Lib HR]] (2 shared connections)
- [[Lib Utils, Job Costing, and Stock]] (2 shared connections)
- [[Lib Utils and Media]] (2 shared connections)
- [[Lib Utils, HR, and Material Master Data]] (1 shared connections)
- [[Lib, Live Updates, and Server]] (1 shared connections)

## Source Files

- `app/api/hr/attendance/[id]/route.ts`
- `app/api/hr/attendance/bulk-upsert/route.ts`
- `app/api/hr/document-types/[id]/route.ts`
- `app/api/hr/documents/[id]/route.ts`
- `app/api/hr/employees/[id]/route.ts`
- `app/api/hr/expertises/[id]/route.ts`
- `app/api/hr/schedule/[id]/route.ts`
- `app/api/hr/visa-periods/[id]/route.ts`
- `app/api/jobs/[id]/cost-engine/snapshots/[snapshotId]/route.ts`
- `app/api/jobs/[id]/cost-engine/snapshots/route.ts`
- `app/api/stock-exception-approvals/[id]/route.ts`
- `app/api/user/profile/route.ts`
- `lib/hr/requireCompanySession.ts`
- `lib/job-costing/budgetJobContext.ts`

## Audit Trail

- EXTRACTED: 125 (83%)
- INFERRED: 25 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*