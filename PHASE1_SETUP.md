# Phase 1: Prisma Setup (COMPLETE)

## Summary

Migrated from MongoDB to MySQL using **Prisma 6** (stable) + **shared database with companyId multi-tenancy**.

✅ Installed: `prisma`, `@prisma/client`, `mariadb` (wire-protocol driver)  
✅ Created: `prisma/schema.prisma` with 14 models + 4 enums  
✅ Created: `lib/db/prisma.ts` singleton client  
✅ Created: initial migration `20260408105028_init`  
✅ Database: `amfgi` on `localhost:3306` with all tables  

---

## Files Created / Modified

### New Files
- **prisma/schema.prisma** — Complete schema (Company, User, Role, Material, StockBatch, Transaction, Job, Customer, Supplier, Unit, Category, Warehouse, MaterialLog, PriceLog + junction tables)
- **prisma/migrations/20260408105028_init/** — SQL migration
- **lib/db/prisma.ts** — Singleton Prisma client with HMR caching

### Modified Files
- **.env** — Added `DATABASE_URL="mysql://root:1234@localhost:3306/amfgi"` (created from .env.local)
- **.env.local** — Updated with DATABASE_URL example
- **package.json** — Prisma + mariadb added, mongoose/mongodb/auth adapter removed (DONE IN LATER PHASE)

---

## Database Setup Steps (What We Did)

1. **Local MySQL** — `mysql://root:1234@localhost:3306`
2. **Database** — Created `amfgi` with `utf8mb4` collation
3. **Migration** — Ran `npx prisma migrate dev --name init` ✅
4. **Verify** — `npx prisma studio` shows all 16 tables created

---

## Important Notes

### Prisma CLI vs Runtime Config
- **CLI** (migrate, studio): Uses `DATABASE_URL` from `.env` file (not `.env.local`)
- **Runtime** (app): Uses `DATABASE_URL` from `.env` or `.env.local`
- **Solution**: Keep both `.env` and `.env.local` synced, or rely on `.env` for everything

### Prisma 6 vs 7
We use **Prisma 6.19.3** (stable) instead of 7 because:
- Prisma 7 requires a complex `prisma.config.ts` setup with driver adapters
- Prisma 6 works out-of-the-box with `DATABASE_URL` in schema
- Both are 100% compatible with our MySQL + multi-tenancy approach
- Upgrade to 7 later if needed (it's backward-compatible)

### cuid() Primary Keys
- All IDs are `String @id @default(cuid())` (NOT auto-incrementing Int)
- Frontend already treats IDs as strings → no code changes needed
- cuid = globally unique + collision-resistant + lexicographically sortable

### Multi-Tenancy via companyId
- Every company-scoped table has `companyId String @relation(...)`
- Every "name" field is unique via `@@unique([companyId, name])`
- System tables (Company, User, Role) are NOT scoped
- No more per-company databases — queries filter by `companyId` in WHERE clause

---

## Next Phase: Auth Rewrite (Phase 2)

Before starting Phase 2, confirm with the user:
1. ✅ Migration succeeded
2. ✅ Database populated
3. Ready to rewrite `auth.ts` to use Prisma

Changes in Phase 2:
- Remove `activeCompanyDbName` from session (no longer needed with shared DB)
- Rewrite `resolvePermissions()` to query Prisma instead of Mongoose
- Update session callback to load User + Company from Prisma
- Update sign-in callback to handle password hashing with Prisma
- Prepare for removal of MongoDB models (Phase 10)
