# AMFGI Application Context

## Overview

AMFGI is a multi-company ERP-style web application focused on stock control, job-based operations, customer and supplier master data, dispatch and delivery-note workflows, reporting, HR/workforce management, and company settings.

The application is designed around company-scoped data access:

- users can belong to one or more companies
- one company is selected as the active working context
- most pages and APIs operate only inside the active company
- permissions are role-driven and checked both in UI and API routes

## Primary Goals

The application helps teams manage:

- materials and stock definitions
- goods receipt and FIFO batch costing
- dispatch, delivery notes, and signed-copy handling
- inter-company stock movement
- job variations and job costing
- customers and suppliers
- HR, attendance, geofence attendance, schedules, and employee documents
- settings such as media, document templates, Google Drive integration, and company setup

## Tech Stack

### Frontend

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Redux Toolkit + RTK Query
- NextAuth v5 beta for authentication/session handling
- `react-hot-toast` for notifications

### Backend

- Next.js route handlers under `app/api`
- Prisma ORM
- MySQL datasource
- Zod for request validation

### Integrations and Utilities

- Google Drive integration for signed copies, media, and print assets
- XLSX export/import support
- Graphify knowledge graph output under `graphify-out/`

## Core Architectural Shape

### 1. App Router UI

Pages live mainly under:

- `app/(app)` for authenticated business screens
- `app/api` for backend APIs
- `app/(auth)` for authentication and company selection flows

Most business workflows are implemented as:

1. App page
2. RTK Query endpoint
3. Route handler
4. Prisma query or transaction

### 2. Company-Scoped Access

Almost every route checks:

- authenticated session exists
- active company exists
- user has permission for the operation

This keeps stock, jobs, customers, HR, and settings isolated per company.

### 3. Permission Model

Permissions are defined centrally in `lib/permissions.ts`.

Examples:

- `material.view`
- `transaction.stock_in`
- `transaction.stock_out`
- `transaction.transfer`
- `transaction.reconcile`
- `job.view`
- `settings.manage`
- HR-specific permissions

These permissions drive:

- role setup in admin
- navigation visibility
- page access through `proxy.ts`
- API authorization checks

## Main Functional Areas

## Stock

The stock workspace is the operational center for inventory-related work.

Main areas:

- Materials
- Goods Receipt
- Dispatch
- Stock Batches
- Inter-Company Transfers
- Issue Reconcile

### Materials

Materials define:

- item name and description
- base unit
- category and warehouse
- stock type
- unit cost and reorder level
- current stock
- UOM conversion chain
- whether negative consumption is allowed

Stock types include normal stock categories plus `Non-Stock`.

### Goods Receipt

Goods receipt creates inbound stock and updates FIFO layers.

Important behavior:

- stock is stored in base units
- receipt pricing is normalized to base-unit cost
- each receipt creates `StockBatch` records
- FIFO valuation is driven from open batch quantities

### Dispatch and Delivery Notes

Dispatch creates outbound stock issues against jobs.

Delivery notes are related but distinct:

- they can include printable custom items
- they can be edited and duplicated
- signed-copy uploads are supported

Dispatch and delivery-note flows are job-centric and tied to job variation usage.

### Stock Batches

Batch records hold FIFO layers:

- quantity received
- quantity available
- unit cost
- receipt date

These are consumed in FIFO order during stock-out operations.

### Inter-Company Transfers

Transfers move stock between companies while preserving costing logic.

The flow:

- consume FIFO from source company
- create inbound stock in destination company
- sync material/UOM/category metadata where needed
- maintain transfer ledger visibility

### Issue Reconcile

Issue reconcile is a separate permissioned workflow for non-stock distribution.

Purpose:

- manually distribute non-stock issue quantities into selected job variations
- use FIFO costing first
- keep explicit history
- allow view, edit, and delete with warnings

The current reconcile design:

- history page under `/stock/issue-reconcile`
- create/edit page under `/stock/issue-reconcile/new`
- selected jobs are variation jobs only
- job list is filtered from current posting-month dispatch-note activity

## Jobs

Jobs are one of the core business objects.

Important concepts:

- jobs belong to customers
- jobs can have parent/variation relationships
- job variations are heavily used in stock and dispatch flows
- costing reports aggregate transaction consumption by job

The application distinguishes:

- parent jobs for grouping/reporting
- variation jobs for execution and material issue workflows

## Customers and Suppliers

Customers and suppliers are company-scoped master data entities.

They support:

- CRUD operations
- contact data
- external sync in some flows
- linkage into jobs, receipts, and operational pages

## Reporting

Reporting includes stock valuation and job consumption/costing.

Stock valuation supports:

- FIFO
- moving average
- current material cost

Job costing uses transaction and batch data to explain consumption and cost against jobs.

## HR and Workforce

The HR side is a substantial module, not just a small add-on.

Areas include:

- employees
- employee documents
- visa/document type settings
- schedules
- attendance
- attendance reporting
- geofence attendance
- expertise catalogs
- self-service employee pages

## Data Model Highlights

Some of the most important Prisma models are:

- `Company`
- `User`
- `Role`
- `Customer`
- `Supplier`
- `Job`
- `Material`
- `MaterialUom`
- `StockBatch`
- `Transaction`
- `TransactionBatch`
- `Warehouse`
- `Category`
- `Unit`
- HR-related models for employees, schedules, attendance, geofence, and documents

### Inventory Model Summary

`Material`

- the item master

`MaterialUom`

- per-material UOM tree with one base UOM and optional derived UOMs

`StockBatch`

- FIFO receipt layers

`Transaction`

- stock movement ledger

`TransactionBatch`

- junction between stock-out/transfer transactions and the specific FIFO batches consumed

## Important Business Rules

### FIFO First

The system treats FIFO as the preferred stock valuation method.

This shows up in:

- stock batch consumption
- stock valuation reporting
- issue reconcile distribution
- transfer costing

### Base Unit Normalization

Costs and stock are normalized to base unit where needed.

This matters for:

- goods receipt pricing
- dispatch validation
- material UOM conversion
- batch costing

### Role + Route + API Protection

Security is layered:

- route protection in `proxy.ts`
- navigation filtering
- API permission checks

This is intentional and should be preserved when adding new features.

## State and Data Fetching

The frontend mostly uses RTK Query endpoints from `store/api/endpoints/*`.

Common pattern:

1. page requests data with RTK Query hook
2. mutation posts to route handler
3. tags invalidate related data
4. pages refresh automatically

This pattern is used heavily across stock, jobs, admin, and settings.

## External File and Document Handling

Google Drive is part of the application's document workflow.

Used for:

- signed delivery-note copies
- media assets
- print templates and company documents
- company letterheads and related files

## Current Product Personality

The application is operational, dense, and admin-heavy.

It behaves like an internal business system rather than a marketing-style app. That means:

- workflows matter more than decorative UI
- permissions matter a lot
- transaction accuracy matters
- auditability matters
- company-scoped separation matters

## Good Mental Model For New Contributors

If you are new to the codebase, think of it as:

- a company-scoped ERP
- with inventory centered on FIFO stock batches
- jobs as the operational destination for stock issues
- role-based access as a first-class concern
- App Router pages backed by route handlers and Prisma transactions

## Where To Start In The Codebase

Recommended entry points:

- `app/(app)/stock/page.tsx` for stock workspace overview
- `lib/permissions.ts` for permission model
- `proxy.ts` for route protection
- `prisma/schema.prisma` for data model
- `store/api/endpoints/*` for frontend/backend API mapping
- `app/api/transactions/*` for stock movement logic
- `app/(app)/customers/jobs/page.tsx` and job-related APIs for job workflows
- `app/(app)/hr/*` for workforce/attendance flows

## Notes

- The repository includes Graphify output in `graphify-out/` for structural analysis.
- Next.js in this repo should be treated carefully because project instructions explicitly warn that conventions may differ from older assumptions.
- Inventory and costing changes should always be checked against FIFO, UOM normalization, and permission boundaries.
