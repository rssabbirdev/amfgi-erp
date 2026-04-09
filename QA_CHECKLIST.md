# QA Checklist: MongoDB → MySQL Migration

Complete this checklist before production deployment.

---

## Code Quality

- [ ] `npx tsc --noEmit` returns 0 errors
- [ ] `npx eslint` returns 0 errors (if configured)
- [ ] `npx prettier --check` returns clean (if configured)
- [ ] All API routes import `{ prisma }` from `@/lib/db/prisma`
- [ ] No remaining `getCompanyDB()` calls in routes
- [ ] No remaining `connectSystemDB()` calls in routes
- [ ] Session type no longer has `activeCompanyDbName` field
- [ ] All FIFO batch logic preserved line-for-line

---

## Database

### Schema Integrity
- [ ] `npx prisma validate` passes
- [ ] `npx prisma studio` opens and shows all 16 tables
- [ ] Migrations applied: `npx prisma migrate status` is clean

### Tables & Data
- [ ] Company table has test data (at least 1 company)
- [ ] User table has test data (at least 1 user per company)
- [ ] Role table has standard roles (e.g., Admin, Viewer, Editor)
- [ ] UserCompanyAccess has entries linking users to companies
- [ ] Material table has test materials (per company)
- [ ] Customer table has test customers (per company)
- [ ] Job table has test jobs (per company)

### Constraints
- [ ] Unique constraint on `companyId_name` enforced (test by creating duplicate)
  - [ ] Materials
  - [ ] Customers
  - [ ] Jobs
  - [ ] Suppliers
  - [ ] Units
  - [ ] Categories
  - [ ] Warehouses
- [ ] Foreign key constraints enforced (test by deleting referenced record)

---

## Authentication & Session

- [ ] Login with credentials (email + password) works
- [ ] Login with Google OAuth works
- [ ] Session includes: `id`, `name`, `email`, `isSuperAdmin`, `activeCompanyId`, `activeCompanySlug`, `activeCompanyName`, `permissions`, `allowedCompanyIds`
- [ ] Session does NOT include: `activeCompanyDbName`
- [ ] `session.user.permissions` is array of strings (not undefined)
- [ ] `session.user.allowedCompanyIds` lists all companies user has access to
- [ ] Switching company via `/api/session/switch-company` works
- [ ] After switch: `activeCompanyId` updates, other fields update
- [ ] Super admin has ALL permissions (not empty array)
- [ ] Regular user has only granted permissions

---

## Materials Domain

### CRUD Operations
- [ ] GET /api/materials — lists active materials (empty if none)
- [ ] POST /api/materials — creates material with unique name per company
- [ ] POST /api/materials with duplicate name — returns 409 error
- [ ] POST /api/materials with invalid schema — returns 422 error
- [ ] GET /api/materials/[id] — fetches specific material
- [ ] GET /api/materials/[id] from different company — returns 404
- [ ] PUT /api/materials/[id] — updates material
- [ ] PUT with duplicate name — returns 409 error
- [ ] DELETE /api/materials/[id] with `hardDelete=false` — soft deletes (sets `isActive=false`)
- [ ] DELETE /api/materials/[id] with `hardDelete=true` — hard deletes (if no transactions linked)

### Logging
- [ ] POST /api/materials/logs — creates audit log entry
- [ ] GET /api/materials/[id]/logs — lists logs for material (ordered by timestamp DESC)
- [ ] Log entries include: materialId, action, changes, changedBy, timestamp

### Price Logs
- [ ] POST /api/materials/price-logs with different prices — creates log
- [ ] POST /api/materials/price-logs with same prices — skips (returns `{ skipped: true }`)
- [ ] GET /api/materials/[id]/price-logs — lists price history (ordered by timestamp DESC)

### Deletion Checks
- [ ] GET /api/materials/[id]/check-delete with no transactions — returns `{ canDelete: true }`
- [ ] GET /api/materials/[id]/check-delete with transactions — returns count + sample data

### Receipt History
- [ ] GET /api/materials/receipt-history-entries with filter=all — lists all receipts
- [ ] GET /api/materials/receipt-history-entries with filter=day + date — lists that day's receipts
- [ ] GET /api/materials/receipt-history-entries with filter=month + date — lists that month's receipts
- [ ] DELETE /api/materials/receipt-history-entries/[receiptNumber] — reverts receipt atomically
  - [ ] All StockBatch records deleted
  - [ ] Material.currentStock restored
  - [ ] All linked transactions reversed

---

## Jobs Domain

### CRUD Operations
- [ ] GET /api/jobs — lists active jobs
- [ ] GET /api/jobs with status filter — filters by status (ACTIVE, COMPLETED, etc.)
- [ ] POST /api/jobs — creates job with unique jobNumber per company
- [ ] POST /api/jobs with duplicate jobNumber — returns 409 error
- [ ] GET /api/jobs/[id] — fetches specific job with customer relation
- [ ] PUT /api/jobs/[id] — updates job (status, dates, description)
- [ ] DELETE /api/jobs/[id] — soft deletes or hard deletes based on transaction count

### Materials Per Job
- [ ] GET /api/jobs/[id]/materials — lists all materials consumed for job
  - [ ] Shows net consumption (STOCK_OUT - RETURN)
  - [ ] Includes material name, unit, quantity, cost
  - [ ] Sorted by material name

### Deletion Checks
- [ ] GET /api/jobs/[id]/check-delete — shows linked transaction count

---

## Customer & Supplier Domain

### Customers
- [ ] GET /api/customers — lists active customers
- [ ] POST /api/customers — creates customer with unique name per company
- [ ] PUT /api/customers/[id] — updates customer
- [ ] DELETE /api/customers/[id] — soft/hard deletes
- [ ] GET /api/customers/[id]/check-delete — shows linked jobs count

### Suppliers
- [ ] GET /api/suppliers — lists active suppliers
- [ ] POST /api/suppliers — creates supplier
- [ ] PUT /api/suppliers/[id] — updates supplier
- [ ] DELETE /api/suppliers/[id] — soft/hard deletes

---

## Reference Tables (Units, Categories, Warehouses)

- [ ] GET /api/units — lists active units
- [ ] POST /api/units — creates unit (unique per company)
- [ ] GET /api/categories — lists active categories
- [ ] POST /api/categories — creates category (unique per company)
- [ ] GET /api/warehouses — lists active warehouses
- [ ] POST /api/warehouses — creates warehouse (unique per company)

---

## Transactions Domain (CRITICAL)

### Basic Transactions
- [ ] POST /api/transactions (STOCK_IN) — adds stock to material
  - [ ] Material.currentStock increments
  - [ ] Transaction created with correct type, quantity, date
- [ ] POST /api/transactions (STOCK_OUT) — removes stock for job
  - [ ] Material.currentStock decrements
  - [ ] Requires jobId (returns 400 if missing)
  - [ ] Checks stock available (returns 400 if insufficient)
- [ ] POST /api/transactions (RETURN) — adds back stock
  - [ ] Material.currentStock increments
  - [ ] Requires jobId

### Batch (FIFO) Consumption
- [ ] POST /api/transactions/batch — consumes stock FIFO
  - [ ] Queries StockBatch ordered by receivedDate (oldest first)
  - [ ] Creates TransactionBatch entries for each batch used
  - [ ] Updates StockBatch.quantityAvailable correctly
  - [ ] Updates Material.currentStock correctly
  - [ ] Calculates totalCost (sum of batch costs)
  - [ ] Calculates averageCost (totalCost / quantity)
  - [ ] All updates atomic (all-or-nothing)
  - [ ] Returns 400 if insufficient total stock

### FIFO Detailed Test
- [ ] Create 3 StockBatches with receivedDates: 2026-01-01, 2026-01-15, 2026-02-01
- [ ] Each has quantityAvailable: 100, 100, 100
- [ ] Consume 250 units via FIFO batch endpoint
- [ ] Verify:
  - [ ] Batch 1 (Jan 1): quantityAvailable = 0 (consumed 100)
  - [ ] Batch 2 (Jan 15): quantityAvailable = 0 (consumed 100)
  - [ ] Batch 3 (Feb 1): quantityAvailable = 50 (consumed 50)
  - [ ] TransactionBatch has 3 entries (one per batch)
  - [ ] Material.currentStock decremented by 250

### Inter-Company Transfers
- [ ] POST /api/transactions/transfer — transfer stock between companies
  - [ ] Creates TRANSFER_OUT in source company
  - [ ] Creates TRANSFER_IN in target company
  - [ ] Both succeed or both rollback (atomic)
  - [ ] Source company stock decrements
  - [ ] Target company stock increments

### Dispatch Entries
- [ ] GET /api/transactions/dispatch-entry — lists dispatch/return transactions
  - [ ] Filters by type (STOCK_OUT, RETURN)
  - [ ] Includes job details, material details, costs
  - [ ] Shows net consumption (dispatched - returned)

### Transaction Deletion
- [ ] DELETE /api/transactions/[id] — deletes transaction
  - [ ] Reverses stock changes
  - [ ] Removes TransactionBatch entries
  - [ ] Updates parent transaction if reversal

---

## Reports

### Stock Valuation
- [ ] GET /api/reports/stock-valuation — calculates current inventory value
  - [ ] totalStockValue = SUM(material.currentStock * material.unitCost)
  - [ ] prevMonthConsumptionValue = SUM(quantities * costs for STOCK_OUT last month)
  - [ ] topMaterialsByValue: top 30 materials by (currentStock * unitCost)
  - [ ] topConsumedItems: top 30 consumed items last month

### Consumption Report
- [ ] GET /api/reports/consumption — tracks material consumption over time
  - [ ] Filter by date range (day/month/all)
  - [ ] Groups by material
  - [ ] Shows cumulative consumption per material
  - [ ] Includes costs

### Job Consumption Report
- [ ] GET /api/reports/job-consumption — per-job material consumption
  - [ ] Groups transactions by jobId
  - [ ] Shows net consumed (STOCK_OUT - RETURN)
  - [ ] Includes material details and total cost per job
  - [ ] Lists all transactions for each job

---

## Permissions & Access Control

- [ ] Super admin can see/create/edit/delete all resources
- [ ] Regular admin (with full permissions) can see/create/edit/delete all resources in their company
- [ ] Viewer (material.view permission) can see materials but not create/edit
- [ ] Permission denials return 403 Forbidden
- [ ] Cross-company access denied:
  - [ ] User from Company A cannot see Company B's materials
  - [ ] User from Company A cannot edit Company B's jobs
  - [ ] Returns 404 (not 403, for security)

---

## Multi-Tenancy Isolation

- [ ] Create 2 companies: CompanyA, CompanyB
- [ ] Create user1 in CompanyA, user2 in CompanyB
- [ ] user1 creates material "Steel" in CompanyA
- [ ] user2 creates material "Steel" in CompanyB (succeeds — same name, different company)
- [ ] user1 lists materials — sees only CompanyA's "Steel"
- [ ] user2 lists materials — sees only CompanyB's "Steel"
- [ ] user1 switches to CompanyB — gets 404 for CompanyA's material
- [ ] user2 switches to CompanyA — gets 404 for CompanyB's material

---

## Error Handling

- [ ] Missing authentication — 401 Unauthorized
- [ ] Invalid permission — 403 Forbidden
- [ ] Resource not found — 404 Not Found
- [ ] Validation error (bad input) — 422 Unprocessable Entity
- [ ] Unique constraint violation — 409 Conflict
- [ ] Insufficient stock — 400 Bad Request
- [ ] No active company selected — 400 Bad Request
- [ ] Database error — 500 Internal Server Error (with generic message)

---

## Performance

- [ ] GET /api/materials — responds in <500ms (with 100+ materials)
- [ ] POST /api/transactions/batch — responds in <1000ms (complex FIFO)
- [ ] GET /api/reports/stock-valuation — responds in <2000ms (with large dataset)
- [ ] No N+1 queries (verify with Prisma Studio or query logs)
- [ ] Pagination works: GET /api/transactions?limit=50&offset=100

---

## Deployment (cPanel)

- [ ] DATABASE_URL configured in cPanel environment
- [ ] Database created and user permissions granted
- [ ] `npx prisma generate` runs without errors
- [ ] `npx prisma migrate deploy` applies migrations
- [ ] Node.js version ≥18.17 available in cPanel
- [ ] Next.js build completes: `npm run build`
- [ ] Dev server starts: `npm run dev`
- [ ] API endpoints respond from production domain

---

## Final Checks

- [ ] All .ts files formatted (trailing commas, quotes consistent)
- [ ] No console.log() spam in production code
- [ ] No `TODO` or `FIXME` comments in critical paths
- [ ] README updated with new setup instructions
- [ ] Environment variables documented in deployment guide
- [ ] Rollback plan reviewed and tested
- [ ] Stakeholders notified of go-live

---

## Sign-Off

- [ ] Developer: Code review complete
- [ ] QA: All test cases passed
- [ ] DevOps: Deployment plan reviewed
- [ ] Product: Functionality confirmed

**Date:** ________  
**Approved by:** ________  
**Comments:** 

---

*Use this checklist to ensure quality before production deployment.*
