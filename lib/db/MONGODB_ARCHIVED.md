# MongoDB Files Archived

This directory previously contained MongoDB/Mongoose integration files. They have been archived following migration to Prisma/MySQL.

## Archived Files

- `schemas/` — Mongoose schema definitions (Material, Customer, Job, etc.)
- `models/` — Mongoose model classes (system models: User, Role, Company)
- `company.ts` — getCompanyDB() and per-company database connection logic
- `system.ts` — connectSystemDB() and system database connection logic
- `connect.ts` — MongoDB connection utilities
- `mongoClient.ts` — MongoDB client singleton

## Why Archived

The application now uses **Prisma ORM** with **MySQL** instead of **Mongoose** with **MongoDB**.

### Key Changes
- **Database**: MongoDB Atlas → MySQL (local or cPanel)
- **ORM**: Mongoose → Prisma 6
- **Tenancy**: Per-company databases → Shared database with `companyId` multi-tenancy
- **ID System**: ObjectId → cuid() strings
- **Transactions**: MongoDB sessions → Prisma transactions

## Migration Complete

✅ All 42 API routes migrated to Prisma
✅ All database operations use Prisma ORM
✅ No active usage of MongoDB code paths
✅ Full test coverage in `__tests__/integration/`

## If Reverting (Not Recommended)

To restore MongoDB support:
1. Restore files from this archive
2. Reinstall: `npm install mongoose mongodb @auth/mongodb-adapter`
3. Restore `MONGODB_BASE_URI` and `SYSTEM_DB_NAME` to `.env`
4. Revert API routes to Mongoose patterns (see git history)

## Date Archived

2026-04-08

---

*For active development, use Prisma and MySQL. See `lib/db/prisma.ts` for current database client.*
