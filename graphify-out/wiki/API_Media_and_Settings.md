# API Media and Settings

> 16 nodes · cohesion 0.20

## Key Concepts

- **auth.ts** (12 connections) — `auth.ts`
- **route.ts** (10 connections) — `app/api/media/[id]/route.ts`
- **route.ts** (9 connections) — `app/api/media/route.ts`
- **route.ts** (9 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **DELETE()** (8 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **requireCompanySession.ts** (8 connections) — `lib/hr/requireCompanySession.ts`
- **requireCompanySession()** (8 connections) — `lib/hr/requireCompanySession.ts`
- **PATCH()** (6 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **GET()** (4 connections) — `app/api/media/route.ts`
- **getPrisma()** (3 connections) — `auth.ts`
- **resolvePermissions()** (3 connections) — `auth.ts`
- **hasManagePermission()** (3 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **canAccess()** (2 connections) — `app/api/media/route.ts`
- **canAccess()** (2 connections) — `app/api/media/[id]/route.ts`
- **auth.ts** (2 connections) — `auth.ts`
- **PatchCredentialSchema** (1 connections) — `app/api/settings/api-credentials/[id]/route.ts`

## Relationships

- [[API Settings, Companies, and Materials]] (16 shared connections)
- [[Lib Utils, Media, and Db]] (8 shared connections)
- [[API HR, User, and Jobs]] (4 shared connections)
- [[API HR, Jobs, and Materials]] (3 shared connections)
- [[Lib, Integrations, and Domain Allowlist]] (3 shared connections)
- [[API Reports, Materials, and HR]] (2 shared connections)
- [[API Media]] (2 shared connections)
- [[Lib Utils]] (2 shared connections)
- [[Lib Live Updates and Warehouses]] (1 shared connections)
- [[API HR, Materials, and Upload]] (1 shared connections)

## Source Files

- `app/api/media/[id]/route.ts`
- `app/api/media/route.ts`
- `app/api/settings/api-credentials/[id]/route.ts`
- `auth.ts`
- `lib/hr/requireCompanySession.ts`

## Audit Trail

- EXTRACTED: 82 (91%)
- INFERRED: 8 (9%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*