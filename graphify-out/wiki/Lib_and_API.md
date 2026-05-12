# Lib and API

> 17 nodes · cohesion 0.23

## Key Concepts

- **route.ts** (10 connections) — `app/api/media/[id]/route.ts`
- **route.ts** (9 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **DELETE()** (8 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **requireCompanySession.ts** (8 connections) — `lib/hr/requireCompanySession.ts`
- **requireCompanySession()** (8 connections) — `lib/hr/requireCompanySession.ts`
- **domainAllowlist.ts** (8 connections) — `lib/integrations/domainAllowlist.ts`
- **integrationDomainCheck()** (7 connections) — `lib/integrations/domainAllowlist.ts`
- **PATCH()** (6 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **domainAllowlist.ts** (6 connections) — `lib/integrations/domainAllowlist.ts`
- **normalizeAllowedDomainsList()** (5 connections) — `lib/integrations/domainAllowlist.ts`
- **parseStoredAllowedDomains()** (4 connections) — `lib/integrations/domainAllowlist.ts`
- **requestClientHost()** (4 connections) — `lib/integrations/domainAllowlist.ts`
- **hasManagePermission()** (3 connections) — `app/api/settings/api-credentials/[id]/route.ts`
- **normalizeDomainOrUrlToHostname()** (3 connections) — `lib/integrations/domainAllowlist.ts`
- **isRequestHostAllowed()** (3 connections) — `lib/integrations/domainAllowlist.ts`
- **canAccess()** (2 connections) — `app/api/media/[id]/route.ts`
- **PatchCredentialSchema** (1 connections) — `app/api/settings/api-credentials/[id]/route.ts`

## Relationships

- [[API Companies, Customers, and Materials]] (12 shared connections)
- [[API HR, User, and Jobs]] (4 shared connections)
- [[API HR, Jobs, and Materials]] (3 shared connections)
- [[Lib Utils and Media]] (3 shared connections)
- [[API and Lib]] (3 shared connections)
- [[Lib Utils]] (2 shared connections)
- [[API Reports, Materials, and HR]] (2 shared connections)
- [[API HR, Materials, and Upload]] (2 shared connections)
- [[API Media]] (1 shared connections)
- [[Lib, Integrations, and Integration Route]] (1 shared connections)

## Source Files

- `app/api/media/[id]/route.ts`
- `app/api/settings/api-credentials/[id]/route.ts`
- `lib/hr/requireCompanySession.ts`
- `lib/integrations/domainAllowlist.ts`

## Audit Trail

- EXTRACTED: 84 (88%)
- INFERRED: 11 (12%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*