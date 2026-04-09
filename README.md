# AMFGI ERP System

A comprehensive inventory management system for fiberglass and steel workshop operations, built with **Next.js 14**, **Prisma 6**, **MySQL**, and **TypeScript**.

**Status:** ✅ Production-ready after MongoDB → MySQL migration (completed 2026-04-08)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Database Setup](#database-setup)
- [Seeding Test Data](#seeding-test-data)
- [Running Tests](#running-tests)
- [API Overview](#api-overview)
- [Deployment](#deployment)
- [Migration Notes](#migration-notes)

---

## Features

### Core Modules

- **Materials Management**: CRUD operations, stock tracking (FIFO batch consumption), cost management, audit logs
- **Job Management**: Job creation, material consumption tracking, job-wise cost analysis
- **Inventory Transactions**: Stock in/out, returns, inter-company transfers, batch tracking
- **Customers & Suppliers**: Customer/supplier management with linked jobs and transactions
- **Reports**: Stock valuation, consumption analysis, job-wise cost reporting
- **Authentication**: Credentials + Google OAuth, role-based permissions, multi-company support
- **Multi-Tenancy**: Per-company data isolation, company switching, role-based access control

### Key Features

✅ **FIFO Stock Consumption**: Materials tracked by batch with First-In-First-Out consumption for accurate costing
✅ **Atomic Transactions**: Inter-company transfers and complex operations guaranteed consistency
✅ **Multi-Tenancy**: Shared database with per-company data isolation via `companyId`
✅ **Soft Deletes**: Safe deletion with audit trails, recover if needed
✅ **Permission System**: Role-based access control (Admin, Manager, Store Keeper, Custom)
✅ **Audit Logging**: Material changes, price history, transaction tracking

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Next.js 14, Redux Toolkit, TailwindCSS |
| **Backend** | Next.js API Routes, TypeScript |
| **Database** | MySQL 8+ via Prisma 6 ORM |
| **Authentication** | NextAuth 5, bcrypt, Google OAuth |
| **Testing** | Jest, ts-jest (integration tests) |
| **Validation** | Zod schemas |
| **Package Manager** | npm |

---

## Project Structure

```
c:\almuraqib-custom-application\AMFGI\
├── app/
│   ├── api/                           # API routes (42 endpoints)
│   │   ├── materials/                 # Material CRUD, logs, receipt history
│   │   ├── jobs/                      # Job CRUD, materials per job
│   │   ├── transactions/              # Stock in/out, FIFO batch, transfers
│   │   ├── reports/                   # Stock valuation, consumption, job consumption
│   │   ├── customers/                 # Customer CRUD
│   │   ├── suppliers/                 # Supplier CRUD
│   │   ├── users/                     # User CRUD (admin)
│   │   ├── roles/                     # Role CRUD (admin)
│   │   ├── companies/                 # Company CRUD (admin)
│   │   └── session/                   # Session & company switching
│   └── (app)/                         # Next.js App Router pages
├── lib/
│   ├── db/
│   │   ├── prisma.ts                  # Prisma client singleton
│   │   └── MONGODB_ARCHIVED.md        # Archive info for old Mongoose files
│   ├── permissions.ts                 # Permission definitions & checks
│   ├── utils/                         # Utilities (API responses, validation)
│   └── ...
├── store/                             # Redux store setup
├── components/                        # React components
├── prisma/
│   ├── schema.prisma                  # Prisma schema (16 models)
│   └── migrations/                    # Database migrations
├── scripts/
│   └── seed.ts                        # Seed test data (2 companies, 9 materials, etc.)
├── __tests__/
│   └── integration/                   # Integration tests (45+ cases)
│       ├── setup.ts                   # Test utilities & context
│       ├── fifo-batch.test.ts         # FIFO consumption tests
│       ├── transfers.test.ts          # Inter-company transfer tests
│       ├── multi-tenancy.test.ts      # Data isolation tests
│       └── materials-crud.test.ts     # CRUD & audit log tests
├── auth.ts                            # NextAuth configuration
├── jest.config.js                     # Jest test runner config
├── .env.example                       # Environment variables template
└── package.json                       # Dependencies
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18.17 (check: `node --version`)
- **npm** (check: `npm --version`)
- **MySQL 8+** (local or cPanel)

### 1. Clone & Install

```bash
cd c:\almuraqib-custom-application\AMFGI
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and `.env.local`:

```bash
cp .env.example .env
cp .env.example .env.local
```

Edit `.env` with your database credentials:

```env
DATABASE_URL="mysql://root:password@localhost:3306/amfgi"
AUTH_SECRET=your_32_character_random_string
NEXTAUTH_URL=http://localhost:3000
```

### 3. Database Setup

#### Local Development (MySQL Community Server)

```bash
# Install MySQL Community Server (https://dev.mysql.com/downloads/mysql/)

# Create database
mysql -u root -p << EOF
CREATE DATABASE amfgi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOF

# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

#### cPanel Hosting

```bash
# 1. Login to cPanel → MySQL Databases
# 2. Create database: amfgi → becomes cpaneluser_amfgi
# 3. Create user: amfgi → add to database with ALL PRIVILEGES
# 4. Update .env:
DATABASE_URL="mysql://cpaneluser_amfgi:password@localhost:3306/cpaneluser_amfgi"

# 5. Deploy on cPanel terminal:
npm install
npx prisma generate
npx prisma migrate deploy
```

### 4. Seed Test Data

```bash
npm run seed
```

Output:
```
✅ Seed complete!
─────────────────────────────────────────────────────────────────
Login credentials:
  Super Admin:   admin@almuraqib.com     / Admin@1234
  AMFGI Manager: manager@amfgi.com       / Manager@1234
  Store Keeper:  storekeeper@amfgi.com   / Store@1234
─────────────────────────────────────────────────────────────────
```

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Database Setup

### Prisma Schema

16 models with multi-tenancy via `companyId`:

| Model | Purpose | Scoping |
|-------|---------|---------|
| `Company` | Organizations | N/A (root) |
| `User` | Users (cross-company) | activeCompanyId |
| `Role` | Permission templates | System-wide |
| `UserCompanyAccess` | User ↔ Company ↔ Role mapping | companyId |
| `Material` | Raw materials/stock items | companyId |
| `StockBatch` | Batch tracking for FIFO | companyId |
| `Transaction` | Stock in/out/transfers | companyId |
| `TransactionBatch` | FIFO batch tracking per transaction | companyId (via transaction) |
| `Job` | Manufacturing/project jobs | companyId |
| `Customer` | Customers | companyId |
| `Supplier` | Suppliers | companyId |
| `Unit` | Units of measure (kg, meter, etc.) | companyId |
| `Category` | Material categories | companyId |
| `Warehouse` | Stock locations | companyId |
| `MaterialLog` | Audit: material changes | companyId |
| `PriceLog` | Audit: cost changes | companyId |

### Key Constraints

- **Composite Unique**: `@@unique([companyId, name])` on Material, Customer, Supplier, Unit, Category, Warehouse
- **Foreign Keys**: Enforced with `onDelete: Cascade` for cleanup
- **Indexes**: On `companyId`, status fields, and date fields for query performance

---

## Seeding Test Data

The seed script populates:

- **2 Companies**: AMFGI (fiberglass), K&M (steel)
- **3 Roles**: Admin, Manager, Store Keeper
- **3 Users**: Super Admin, AMFGI Manager, Store Keeper
- **9 Materials**: 5 for AMFGI, 4 for K&M
- **4 Customers**: 2 per company
- **4 Suppliers**: 2 per company
- **3 Jobs**: 2 for AMFGI, 1 for K&M
- **Stock Batches**: FIFO tracking for each material
- **Audit Logs**: Material creation logs, price logs

Run: `npm run seed`

---

## Running Tests

### Install Test Dependencies (One-Time)

```bash
npm install --save-dev jest ts-jest @types/jest
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
npm test -- fifo-batch.test.ts          # FIFO stock consumption
npm test -- transfers.test.ts           # Inter-company transfers
npm test -- multi-tenancy.test.ts       # Data isolation
npm test -- materials-crud.test.ts      # CRUD operations
```

### Test Options

```bash
npm test -- --watch                     # Watch mode
npm test -- --coverage                  # Coverage report
npm test -- --verbose                   # Detailed output
```

**Expected Results:** 45+ test cases, all passing, ~30-60 seconds total.

See `__tests__/README.md` for detailed test coverage documentation.

---

## API Overview

### Authentication

- **POST** `/api/auth/signin` — Login (credentials or OAuth)
- **POST** `/api/auth/signout` — Logout
- **POST** `/api/session/switch-company` — Switch active company

### Materials (9 routes)

- **GET** `/api/materials` — List active materials (company-scoped)
- **POST** `/api/materials` — Create material
- **GET** `/api/materials/[id]` — Get material details
- **PUT** `/api/materials/[id]` — Update material
- **DELETE** `/api/materials/[id]` — Soft/hard delete material
- **POST** `/api/materials/[id]/logs` — Log material change (audit)
- **GET** `/api/materials/[id]/logs` — List material logs
- **POST** `/api/materials/receipt-history-entries` — Group receipts by GRN
- **DELETE** `/api/materials/receipt-history-entries/[receiptNumber]` — Revert receipt (atomic)

### Transactions (5 routes)

- **GET** `/api/transactions` — List transactions (company-scoped)
- **POST** `/api/transactions` — Create stock in/out/return
- **POST** `/api/transactions/batch` — FIFO batch consumption
- **POST** `/api/transactions/transfer` — Inter-company transfer (atomic)
- **DELETE** `/api/transactions/[id]` — Delete transaction (reverse changes)

### Reports (3 routes)

- **GET** `/api/reports/stock-valuation` — Inventory value + last month consumption
- **GET** `/api/reports/consumption` — Material consumption by period
- **GET** `/api/reports/job-consumption` — Per-job material consumption

### Admin (11 routes)

- **Users**: GET, POST, GET [id], PUT [id], DELETE [id]
- **Roles**: GET, POST, GET [id], PUT [id], DELETE [id]
- **Companies**: GET, POST, GET [id], PUT [id]

### Jobs, Customers, Suppliers (8 routes)

- Standard CRUD per entity

**Full API specification:** See `DEVELOPER_GUIDE.md` (in root) for request/response examples.

---

## Deployment

### cPanel (Shared Hosting)

```bash
# 1. SSH into cPanel
ssh cpanel_user@your_domain.com

# 2. Clone repo
git clone <repo_url> ~/public_html/erp
cd ~/public_html/erp

# 3. Setup environment
cp .env.example .env

# 4. Install dependencies
npm install

# 5. Build Next.js
npm run build

# 6. Create MySQL database (via cPanel GUI or SSH)
mysql -u cpaneluser_amfgi -p << EOF
CREATE DATABASE cpaneluser_amfgi CHARACTER SET utf8mb4;
EOF

# 7. Run migrations
npx prisma migrate deploy

# 8. Start app (via cPanel process manager or PM2)
npm start
# or
pm2 start "npm start" --name amfgi-erp
```

### Environment Variables (cPanel)

Store in `.env`:

```
DATABASE_URL=mysql://cpaneluser_amfgi:password@localhost:3306/cpaneluser_amfgi
NEXTAUTH_URL=https://yourdomain.com
AUTH_SECRET=your_32_char_secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Migration Notes

### MongoDB → MySQL Completed ✅

**Migration Date:** 2026-04-08

**What Changed:**
- ✅ Database: MongoDB Atlas → MySQL (local/cPanel)
- ✅ ORM: Mongoose → Prisma 6
- ✅ Tenancy: Per-company databases → Shared database with `companyId`
- ✅ ID System: ObjectId → cuid() strings
- ✅ Transactions: MongoDB sessions → Prisma atomic transactions
- ✅ 42 API routes fully migrated
- ✅ 0 remaining MongoDB dependencies

**What Stayed the Same:**
- ✅ API response shapes (no breaking changes for frontend)
- ✅ Permission system & checks
- ✅ FIFO batch logic (line-for-line preserved)
- ✅ Soft delete behavior (`isActive` flag)
- ✅ Validation schemas (Zod)

**Archived Files:**
- Old Mongoose schemas in `lib/db/schemas/` (not used)
- Old Mongoose models in `lib/db/models/` (not used)
- See `lib/db/MONGODB_ARCHIVED.md` for details

**Verification:**
```bash
npx tsc --noEmit                    # 0 TypeScript errors
npx prisma validate                 # Schema valid
npm test                            # All tests pass
npm run build                       # Build succeeds
```

---

## Documentation

- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** — Prisma patterns, common queries, error handling
- **[MIGRATION_COMPLETE.md](./MIGRATION_COMPLETE.md)** — Full migration details, architecture, rollback plan
- **[REMAINING_PHASES.md](./REMAINING_PHASES.md)** — Post-migration roadmap (if needed)
- **[QA_CHECKLIST.md](./QA_CHECKLIST.md)** — Pre-deployment testing checklist

---

## Support & Troubleshooting

### Database Connection Issues

**Error:** `Connection refused at localhost:3306`

- **Fix**: Ensure MySQL is running: `mysql.server start` (macOS) or Services app (Windows)

### Prisma Client Not Found

**Error:** `Cannot find module '@prisma/client'`

- **Fix**: Run `npx prisma generate` after installing dependencies

### Tests Failing

**Error:** `Cannot find name 'prisma'`

- **Fix**: Ensure `.env` has `DATABASE_URL` set and MySQL is running

---

## License

(Add your license here)

---

**Last Updated:** 2026-04-08  
**Migration Status:** ✅ Complete — Production Ready
