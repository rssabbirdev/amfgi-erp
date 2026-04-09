# Remaining Migration Phases (5-11)

## Status Overview

**Completed (4 phases):**
- Phase 1: Infrastructure ✅
- Phase 2: Auth layer ✅
- Phase 3: Materials domain ✅
- Phase 4: Jobs/Customers/Suppliers/References/Transactions/Reports ✅

**Remaining (7 phases):**
- Phase 5: Admin domain (Users, Roles, Companies)
- Phase 6: Special/Cross-company routes
- Phase 7: Session & company switching
- Phase 8: Cleanup (remove MongoDB imports)
- Phase 9: Seed data script
- Phase 10: Integration tests
- Phase 11: MongoDB removal & final documentation

---

## Phase 5: Admin Domain (Users, Roles, Companies)

**Files to migrate (8 routes):**
- `app/api/users/route.ts` (GET, POST)
- `app/api/users/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/roles/route.ts` (GET, POST)
- `app/api/roles/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/companies/route.ts` (GET, POST)
- `app/api/companies/[id]/route.ts` (GET, PUT, DELETE)

**Models to use (Prisma):**
- User (already have schema, auth.ts partly uses it)
- Role (already have schema)
- Company (already have schema)
- UserCompanyAccess (junction table)

**Key changes:**
- Replace `connectSystemDB()` + `User.findOne()` with `prisma.user.findUnique()`
- Replace `Role.findOne()` with `prisma.role.findUnique()`
- Replace `Company.findOne()` with `prisma.company.findUnique()`
- Add proper uniqueness checks (email for User, slug for Company/Role)
- Handle UserCompanyAccess junction creation/deletion

---

## Phase 6: Special/Cross-Company Routes

**Files to migrate (1 route):**
- `app/api/materials/cross-company/route.ts` (POST)

**Current behavior:**
- Creates TRANSFER_OUT in source company
- Creates TRANSFER_IN in target company
- Needs atomic operation across both

**Prisma implementation:**
- Use `prisma.$transaction()` to ensure atomicity
- Create transaction in source: `TRANSFER_OUT`
- Create transaction in target: `TRANSFER_IN`
- Update stock in both companies
- All or nothing

---

## Phase 7: Session & Company Switching

**Files to review/migrate (1 route):**
- `app/api/session/switch-company/route.ts` (POST)

**Current behavior:**
- Changes user's `activeCompanyId`
- Recalculates permissions for new company
- Returns updated session

**Prisma implementation:**
- Update `user.activeCompanyId`
- Query UserCompanyAccess for new company
- Load role + permissions
- Return updated session

---

## Phase 8: Cleanup (Remove MongoDB Imports)

**Tasks:**
- Remove all `getCompanyDB()` calls from routes
- Remove all `connectSystemDB()` calls from routes
- Remove imports: `getCompanyDB`, `getModels`, `connectSystemDB`, `Company`, `User`, `Role`, `Types`
- Remove `import { Types } from 'mongoose'`
- Verify no remaining MongoDB patterns in API routes
- Verify no remaining Mongoose model references

**Verification:**
```bash
grep -r "getCompanyDB\|connectSystemDB\|from 'mongoose'" app/api --include="*.ts" | wc -l
# Should be 0
```

---

## Phase 9: Seed Data Script

**Files to create/update:**
- `scripts/seed.ts` — populate test data

**Data to seed:**
1. Companies: "AMFGI", "KM", etc.
2. Roles: Admin, Viewer, Editor
3. Users: Test users for each company
4. UserCompanyAccess: Link users to companies with roles
5. Materials: Sample materials per company
6. Customers: Sample customers per company
7. Suppliers: Sample suppliers per company
8. Units: Common units (kg, m, etc.)
9. Categories: Material categories
10. Warehouses: Sample warehouses
11. StockBatches: Sample stock with FIFO dates
12. Jobs: Sample active/completed jobs
13. Transactions: Sample stock in/out/transfers

**Run:**
```bash
npm run seed
```

---

## Phase 10: Integration Tests

**Tests to create (if not existing):**
- Auth: login, logout, company switching
- Materials: CRUD, uniqueness, soft delete, hard delete with transaction checks
- Jobs: CRUD, linked material consumption
- Transactions: FIFO batch, transfer, dispatch entry
- Reports: stock valuation, consumption, job consumption
- Permissions: verify access control per role
- Multi-tenancy: verify data isolation between companies

**Run:**
```bash
npm test
# or
npx jest --watch
```

---

## Phase 11: MongoDB Removal & Final Documentation

**Tasks:**
1. Archive Mongoose models:
   - Move `lib/db/schemas/*.ts` to `lib/db/schemas.archived/`
   - Move `lib/db/models/` to `lib/db/models.archived/`
   - Move `lib/db/company.ts` to `lib/db/company.ts.archived`
   - Move `lib/db/system.ts` to `lib/db/system.ts.archived`

2. Remove from package.json:
   - `mongoose`
   - `mongodb`
   - `@auth/mongodb-adapter` (if using Prisma instead)

3. Remove from .env.local:
   - `MONGODB_BASE_URI`
   - `SYSTEM_DB_NAME`

4. Update documentation:
   - README.md: Update database setup instructions
   - .env.example: Remove MongoDB vars
   - Deployment guide: Update cPanel MySQL steps

5. Final verification:
   - No TypeScript errors: `npx tsc --noEmit`
   - All routes compile
   - All imports resolved
   - No dead code

---

## Files Still Using MongoDB (23 references)

```
app/api/companies/[id]/route.ts
app/api/companies/route.ts
app/api/materials/cross-company/route.ts
app/api/roles/[id]/route.ts
app/api/roles/route.ts
app/api/session/switch-company/route.ts
app/api/users/[id]/route.ts
app/api/users/route.ts
```

Total to migrate: **8 files**

---

## Estimated Work

| Phase | Files | Routes | Effort | Status |
|-------|-------|--------|--------|--------|
| 5 | 6 | 8 | 1 hour | ⏳ Pending |
| 6 | 1 | 1 | 30 min | ⏳ Pending |
| 7 | 1 | 1 | 30 min | ⏳ Pending |
| 8 | 42 | 42 | 30 min | ⏳ Cleanup |
| 9 | 1 | — | 1 hour | ⏳ Pending |
| 10 | 5-10 | — | 2-3 hours | ⏳ Pending |
| 11 | — | — | 1 hour | ⏳ Pending |

**Total remaining: ~7 hours**

---

## Next Immediate Action

**Phase 5: Admin Domain** — Migrate Users, Roles, Companies routes

Should I proceed with Phase 5?
