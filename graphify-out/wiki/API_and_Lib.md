# API and Lib

> 10 nodes · cohesion 0.36

## Key Concepts

- **route.ts** (10 connections) — `app/api/settings/api-credentials/route.ts`
- **POST()** (6 connections) — `app/api/settings/api-credentials/route.ts`
- **sha256()** (5 connections) — `lib/integrations/apiKeys.ts`
- **resolveApiCredentialByKey()** (5 connections) — `lib/integrations/apiKeys.ts`
- **GET()** (4 connections) — `app/api/settings/api-credentials/route.ts`
- **apiKeys.ts** (4 connections) — `lib/integrations/apiKeys.ts`
- **generateIntegrationApiKey()** (4 connections) — `lib/integrations/apiKeys.ts`
- **hasManagePermission()** (3 connections) — `app/api/settings/api-credentials/route.ts`
- **apiKeys.ts** (3 connections) — `lib/integrations/apiKeys.ts`
- **CreateCredentialSchema** (1 connections) — `app/api/settings/api-credentials/route.ts`

## Relationships

- [[API Companies, Customers, and Materials]] (7 shared connections)
- [[Lib and API]] (3 shared connections)
- [[Lib Utils, HR, and Material Master Data]] (1 shared connections)
- [[API HR, Materials, and Upload]] (1 shared connections)
- [[Lib, Integrations, and Integration Route]] (1 shared connections)

## Source Files

- `app/api/settings/api-credentials/route.ts`
- `lib/integrations/apiKeys.ts`

## Audit Trail

- EXTRACTED: 42 (93%)
- INFERRED: 3 (7%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*