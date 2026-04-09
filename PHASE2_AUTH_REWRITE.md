# Phase 2: Auth Rewrite & activeCompanyDbName Removal (COMPLETE)

## Summary

Completed migration of authentication layer from Mongoose to Prisma. Removed the `activeCompanyDbName` field from session (no longer needed with shared MySQL database).

✅ Rewrote auth.ts to use Prisma instead of Mongoose  
✅ Removed `activeCompanyDbName` from session type  
✅ Updated all 33+ API routes to add company lookup before getCompanyDB()  
✅ Fixed compilation errors (38 files updated, 0 TypeScript errors)  

---

## Key Changes

### 1. auth.ts Rewrite

**Session type changes:**
- ❌ Removed: `activeCompanyDbName`
- ✅ Kept: `activeCompanyId`, `activeCompanySlug`, `activeCompanyName`, `permissions`, `allowedCompanyIds`

**Database queries updated:**
- ❌ `User.findById()` → ✅ `prisma.user.findUnique({ where: { id }, include: { companyAccess } })`
- ❌ `Company.findById()` → ✅ `prisma.company.findUnique({ where: { id } })`
- ❌ `Role.findById()` → ✅ Queried via `userCompanyAccess.include({ role: true })`

**resolvePermissions() function:**
- Now queries `prisma.userCompanyAccess.findUnique({ userId_companyId })`
- Returns `role.permissions` (stored as JSON in Prisma)
- Checks `user.isSuperAdmin` for ALL_PERMISSIONS

**JWT / Session callbacks:**
- No longer copy `activeCompanyDbName` to token
- All other callbacks (signIn, jwt, session) work unchanged

### 2. API Route Updates (38 files)

**Pattern applied to all routes:**
```typescript
// 1. Import company helpers (if not already present)
import { connectSystemDB } from '@/lib/db/system';
import { Company } from '@/lib/db/models/system/Company';

// 2. Inside each handler function
if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

await connectSystemDB();
const company = await Company.findById(session.user.activeCompanyId).lean();
if (!company) return errorResponse('Company not found', 404);
const dbName = company.dbName;

// 3. Continue with getCompanyDB(dbName) as before
const conn = await getCompanyDB(dbName);
```

**Files updated:**
- 33 API route files (GET, POST, PUT, DELETE handlers)
- 2 client components (removed activeCompanyDbName from session.update() calls)
- 1 auth helper file (removed getActiveDbName() function)
- 1 dashboard page (refactored to check activeCompanyId)

### 3. Why This Works (Transition Pattern)

We're **not removing MongoDB yet** — this phase only removes the `activeCompanyDbName` field:

```
Old flow:
  Session has: id, activeCompanyId, activeCompanyDbName ← passed via session
  Route uses: getCompanyDB(activeCompanyDbName) ← direct usage

New flow:
  Session has: id, activeCompanyId ← passed via session
  Route queries: Company.findById(activeCompanyId) → dbName ← derived from system DB
  Route uses: getCompanyDB(dbName) ← same as before
```

The routes still use MongoDB per-company databases (via `getCompanyDB()`, `getModels()`, Mongoose models). The next phases will:
- **Phase 3** onwards: Migrate individual domains (materials, jobs, etc.) to Prisma + MySQL
- **Phase 10**: Remove MongoDB entirely

---

## TypeScript Verification

```bash
npx tsc --noEmit
# Output: 0 errors ✅
```

All routes compile without issues. Session types are correctly updated across the codebase.

---

## Database State

- **MySQL (Prisma)**: System tables only (Company, User, Role, UserCompanyAccess)
- **MongoDB**: Company-scoped tables still live here (Material, Transaction, Job, etc.)
- **Shared responsibility**: activeCompanyId used for both system DB and company DB lookups

---

## Next Phase: Phase 3 (Materials Domain)

When ready, Phase 3 will:
1. Migrate Material, StockBatch, MaterialLog, PriceLog to Prisma + MySQL
2. Update app/api/materials/* routes to query Prisma instead of MongoDB
3. Remove Mongoose Material, StockBatch, MaterialLog, PriceLog schemas
4. Test goods receipt flow with MySQL backend

**Estimated routes to update:** ~10 (materials, logs, price-logs, dispatch-history, receipt-history)

---

## Summary Stats

- **Files touched:** 38
- **Session fields removed:** 1 (`activeCompanyDbName`)
- **API routes updated:** 33+
- **Compilation errors:** 0
- **Breaking changes:** None (backward compatible for clients)
