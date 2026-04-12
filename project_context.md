# AMFGI ERP — Project Context

Foundational context for AI-assisted work on this repository. **AMFGI** = Almuraqib Fiber Glass Industry internal ERP (`amfgi-erp` in `package.json`).

---

## Project Overview

Multi-tenant **stock, job, and transaction** system for fiberglass/manufacturing operations. Core capabilities:

- **Tenancy:** `Company` records; each user has `UserCompanyAccess` + `Role` with JSON `permissions`; `User.activeCompanyId` selects the working company for API scoping.
- **Inventory:** `Material` with `currentStock`; **FIFO** via `StockBatch` (receipt batches) and `TransactionBatch` (per-batch consumption on dispatch).
- **Transactions:** `Transaction` types `STOCK_IN`, `STOCK_OUT`, `RETURN`, `TRANSFER_IN`, `TRANSFER_OUT`, `REVERSAL`; optional `jobId`, `parentTransactionId` (e.g. transfer pairs), costing fields (`totalCost`, `averageCost`). Delivery-note flow uses `isDeliveryNote` and optional signed-copy fields (`signedCopyDriveId`, `signedCopyUrl`).
- **Jobs & CRM:** `Job` (variations via `parentJobId`), `Customer`, `Supplier`; reference data: `Unit`, `Category`, `Warehouse`.
- **Reporting:** Stock valuation and consumption endpoints; job consumption / costing views.
- **Admin:** Super-admin vs role-based users; companies, users, roles, company profiles; settings include **print templates** (`Company.printTemplates` JSON) and **letterhead** (Google Drive–backed URLs/IDs).
- **Auth:** NextAuth v5 JWT sessions; Google OAuth (registered users only) + credentials (bcrypt).

---

## Tech Stack

| Layer | Choice |
|--------|--------|
| Runtime / framework | **Node**, **Next.js 16** (App Router, Turbopack default in config) |
| UI | **React 19**, **Tailwind CSS 4** (`@import "tailwindcss"` in `app/globals.css`) |
| Language | **TypeScript 5** |
| Data | **MySQL** via **Prisma 6** (`prisma/schema.prisma`) |
| Auth | **next-auth** v5 beta (`auth.ts`, JWT strategy) |
| Client data fetching | **Redux Toolkit** + **RTK Query** (`appApi`, `adminApi`) |
| Validation | **Zod** 4 in API routes and `lib/validations/*.schema.ts` |
| Integrations | **googleapis** (Drive upload for letterheads / signed copies; OAuth refresh token env) |
| UX libs | **react-hot-toast**, **@dnd-kit** (print template builder) |
| Bulk IO | **xlsx** (material bulk import) |
| Tests | **Jest** + **ts-jest**, `testEnvironment: 'node'`, integration tests under `__tests__/integration/` |

Notable config: `next.config.ts` sets `serverExternalPackages: ['mongoose']` (legacy/no Mongoose models in tree—likely harmless leftover), `images.remotePatterns` for `lh3.googleusercontent.com` (letterhead previews).

---

## Architecture & Directory Structure

High-level layout (boilerplate omitted):

```
AMFGI/
├── app/
│   ├── layout.tsx              Root layout: `auth()`, Inter font, `AppProviders`
│   ├── page.tsx                Redirect: session → `/dashboard`, else `/login`
│   ├── globals.css             Tailwind 4 entry + dark theme CSS vars
│   ├── (app)/                  Authenticated app chrome: `layout.tsx` → Sidebar + Header + `<main>`
│   │   ├── dashboard/
│   │   ├── jobs/               list, form, [id], consumption-costing
│   │   ├── materials/          list, [id], dispatch, dispatch-history
│   │   ├── goods-receipt/      receive flow
│   │   ├── dispatch/           hub, entry, delivery-note
│   │   ├── customers/, suppliers/
│   │   ├── reports/job-consumption/
│   │   ├── settings/
│   │   └── admin/              companies, users, roles, profiles
│   ├── (auth)/                 login, select-company, select-profile
│   ├── api/                    REST-style Route Handlers (`route.ts` per path)
│   ├── print/                  e.g. `print/delivery-note` — print-friendly pages
│   └── unauthorized/
├── components/
│   ├── layout/                 Sidebar, Header, CompanySwitcher (tenant + JWT + Redux sync)
│   ├── ui/                     Button, Modal, DataTable, SearchSelect, skeletons, ContextMenu, …
│   ├── jobs/, materials/, transactions/, print-builder/
├── lib/
│   ├── auth/requireSession.ts  Server helper: `auth()` + optional `Permission` → redirect
│   ├── db/prisma.ts            Singleton PrismaClient (HMR-safe on `global`)
│   ├── permissions.ts          `P.*` permission constants, `ROLE_PRESETS`, `ALL_PERMISSIONS`
│   ├── types/                  e.g. `documentTemplate.ts` (section-based print model)
│   ├── utils/                  FIFO, stock batches, formatters, Google Drive, API helpers, …
│   └── validations/            Zod schemas (job, material, transaction, customer, …)
├── prisma/
│   ├── schema.prisma           MySQL models + enums
│   └── migrations/             SQL migrations
├── providers/                  AppProviders, Redux, Session, ContextMenu
├── store/
│   ├── store.ts                `ui` + `company` slices + RTK Query reducers/middleware
│   ├── hooks.ts                Typed hooks + re-exports of all generated RTK Query hooks
│   ├── slices/uiSlice.ts       Global modal registry (`openModal` / `closeModal`)
│   ├── slices/companySlice.ts  Mirrors active company + permissions (updated on company switch)
│   └── api/
│       ├── appApi.ts           `baseUrl: '/api'`, company-scoped tag types
│       ├── adminApi.ts         Same base URL, admin tag types
│       ├── endpoints/          `injectEndpoints` into `appApi`
│       └── adminEndpoints/     `injectEndpoints` into `adminApi`
├── scripts/seed.ts             DB seeding (tsx)
└── __tests__/integration/      API/business logic integration tests (FIFO, transfers, multi-tenancy)
```

**Responsibilities:**

- **`app/(app)`** — Primary UI behind session; permissions gate **Sidebar** links (client-side string checks against session).
- **`app/api`** — All persistence and authorization enforcement for mutations; uses `auth()` and `session.user.activeCompanyId` for row-level tenancy.
- **`lib/utils`** — Pure/domain helpers (FIFO calculation, batch creation, document defaults) reused by route handlers.
- **`store`** — Client cache and mutations; `transformResponse` often unwraps `{ success, data }` from APIs.

---

## Core Data Flow & State

1. **Server session:** `app/layout.tsx` calls `auth()`; `SessionProvider` receives the session. JWT carries `activeCompanyId`, `permissions`, `allowedCompanyIds`, `isSuperAdmin`.

2. **Company switch:** `CompanySwitcher` POSTs `/api/session/switch-company` → updates `User.activeCompanyId` in DB, returns new slug/name/permissions → `useSession().update(...)` refreshes JWT → `dispatch(switchActiveCompany(...))` → `dispatch(appApi.util.resetApiState())` to drop stale company-scoped RTK cache.

3. **API pattern:** Handlers import `auth()`, return `errorResponse` / `successResponse` (`lib/utils/apiResponse.ts`) with shape `{ success, data? }` or `{ success: false, error }`. Zod validates bodies/query where used.

4. **Client reads/writes:** RTK Query `fetchBaseQuery({ baseUrl: '/api' })` — hooks defined in `store/api/endpoints/*.ts` and re-exported from `store/hooks.ts`. Tag-based invalidation keeps lists in sync after mutations.

5. **Heavy writes:** `POST /api/transactions/batch` runs `prisma.$transaction`: creates/reverses `StockBatch` rows, applies FIFO via `calculateFIFOConsumption`, writes `Transaction` + `TransactionBatch`, updates `Material.currentStock`, handles delivery-note-only payloads and optional reversal of prior transactions (`existingTransactionIds`).

6. **Redux non-RTK state:** `uiSlice` (modals), `companySlice` (optional mirror of session company fields after switch). Most entity state lives in RTK Query cache.

7. **Print / documents:** Template definition in `lib/types/documentTemplate.ts` (sections: letterhead, tables, field rows, etc.); defaults in `lib/utils/documentDefaults.ts`; UI in `components/print-builder/*`; `Company.printTemplates` stores per–item-type JSON. Letterhead/signed-copy binary flows through `app/api/upload/*` and `lib/utils/googleDrive.ts` (service account–style OAuth refresh).

**Note:** There is **no `middleware.ts`**; unauthenticated access is handled by page-level `useSession` + redirects and API-level `auth()` checks, plus `requireSession()` on server components that opt into it.

---

## Key Entry Points & Core Logic

| Concern | Location |
|---------|----------|
| NextAuth config, JWT/session population, Google + credentials | `auth.ts` |
| Auth route | `app/api/auth/[...nextauth]/route.ts` |
| Root bootstrap | `app/layout.tsx`, `providers/AppProviders.tsx` |
| Post-login routing | `app/page.tsx` → `/dashboard` or `/login` |
| Permission constants & presets | `lib/permissions.ts` |
| Server-gated pages (pattern) | `lib/auth/requireSession.ts` (optional; many pages use client `useSession` only) |
| Prisma singleton | `lib/db/prisma.ts` |
| FIFO math | `lib/utils/fifoConsumption.ts` |
| Batch receipt shaping | `lib/utils/stockBatchManagement.ts` |
| Stock mutations / costing / reversals | `app/api/transactions/batch/route.ts` (largest transactional block) |
| Single transaction CRUD | `app/api/transactions/route.ts`, `app/api/transactions/[id]/route.ts` |
| Transfers | `app/api/transactions/transfer/route.ts` |
| Dispatch entry aggregation | `app/api/transactions/dispatch-entry/route.ts` |
| Materials, jobs, customers, suppliers, warehouses, units, categories | `app/api/**/route.ts` under respective segments |
| Reports | `app/api/reports/stock-valuation`, `consumption`, `job-consumption`, job costing |
| Multi-tenant admin APIs | `app/api/companies`, `users`, `roles`, `company-profiles` + `store/api/adminEndpoints/*` |
| Seed data | `scripts/seed.ts` |
| Regression / integration tests | `__tests__/integration/*.test.ts` |

---

## Coding Conventions

- **Imports:** Path alias `@/` → project root (see `tsconfig.json`).
- **API responses:** Prefer `successResponse` / `errorResponse` for consistent JSON envelopes.
- **Permissions:** String literals matching `P` values (e.g. `'transaction.stock_in'`); super-admin bypass via `isSuperAdmin`. Role permissions stored as JSON array on `Role.permissions`.
- **Tenancy:** Almost all queries filter by `session.user.activeCompanyId`; super-admin flows may use broader queries where explicitly coded (e.g. company list).
- **RTK Query:** Split **app** vs **admin** APIs; endpoints injected from separate files; `transformResponse` unwraps `.data`; tags like `'Material'`, `'Job'`, etc.
- **UI:** Dark theme (`slate-*`), `Inter`, reusable `components/ui/*`; tables often use shared `DataTable`.
- **Prisma:** `cuid()` IDs; heavy use of `@@unique([companyId, ...])` for per-tenant uniqueness.
- **Print:** Section-based template model (not absolute canvas coordinates); `@dnd-kit` used in builder UI.

---

## Constraints & Gotchas

- **Active company required** for most mutating/list APIs: `400` if `activeCompanyId` is null.
- **Sidebar vs API permissions:** e.g. **Suppliers** nav uses `perm: 'supplier.view'`, but `app/api/suppliers` gates with `transaction.stock_in`. Super-admins see all nav items; other roles may see a nav link that does not match API checks unless roles include the API’s expected permission — treat as a known inconsistency when changing RBAC.
- **`ProfileSwitcher`** is a stub; **CompanySwitcher** is the real tenant control.
- **Next.js 16 / React 19 / Zod 4 / NextAuth v5 beta** — assume breaking-change sensitivity when upgrading.
- **Environment:** `DATABASE_URL` (MySQL), NextAuth secrets, Google OAuth (login) vs Drive upload vars (`GOOGLE_OAUTH_*` refresh token pattern in `lib/utils/googleDrive.ts`).
- **Tests:** Jest targets `__tests__/**/*.test.ts` with Node environment; coverage config points at `app/api` only.

---

*Generated from repository structure and source analysis. Update this file when architecture or flows change materially.*
