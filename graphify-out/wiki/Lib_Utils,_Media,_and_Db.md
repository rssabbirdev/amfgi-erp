# Lib Utils, Media, and Db

> 15 nodes · cohesion 0.26

## Key Concepts

- **prisma.ts** (15 connections) — `lib/db/prisma.ts`
- **route.ts** (10 connections) — `app/api/media/cleanup/route.ts`
- **convertGoogleDriveUrl()** (10 connections) — `lib/utils/googleDriveUrl.ts`
- **googleDriveUrl.ts** (9 connections) — `lib/utils/googleDriveUrl.ts`
- **extractGoogleDriveFileId()** (9 connections) — `lib/utils/googleDriveUrl.ts`
- **driveFileIdToDisplayUrl()** (7 connections) — `lib/utils/googleDriveUrl.ts`
- **POST()** (6 connections) — `app/api/media/cleanup/route.ts`
- **userScopedMedia.ts** (6 connections) — `lib/media/userScopedMedia.ts`
- **finalizeUserMediaUpload()** (6 connections) — `lib/media/userScopedMedia.ts`
- **finalizeUserMediaUpload()** (4 connections) — `lib/media/userScopedMedia.ts`
- **resolveBoundFieldImageSrc()** (4 connections) — `lib/utils/googleDriveUrl.ts`
- **googleDriveUrl.ts** (4 connections) — `lib/utils/googleDriveUrl.ts`
- **canAccess()** (2 connections) — `app/api/media/cleanup/route.ts`
- **UserMediaKind** (1 connections) — `lib/media/userScopedMedia.ts`
- **userScopedMedia.ts** (1 connections) — `lib/media/userScopedMedia.ts`

## Relationships

- [[API Media and Settings]] (8 shared connections)
- [[API Settings, Companies, and Materials]] (8 shared connections)
- [[Lib Utils]] (8 shared connections)
- [[API HR, Materials, and Upload]] (4 shared connections)
- [[Lib Utils, HR, and Material Master Data]] (3 shared connections)
- [[Lib Live Updates and Warehouses]] (2 shared connections)
- [[Lib Integrations, Party Lists API, and Party List Sync]] (2 shared connections)
- [[API HR, User, and Jobs]] (2 shared connections)
- [[API Media]] (1 shared connections)
- [[Lib Integrations and Party Contacts]] (1 shared connections)
- [[API HR, Jobs, and Materials]] (1 shared connections)

## Source Files

- `app/api/media/cleanup/route.ts`
- `lib/db/prisma.ts`
- `lib/media/userScopedMedia.ts`
- `lib/utils/googleDriveUrl.ts`

## Audit Trail

- EXTRACTED: 78 (83%)
- INFERRED: 16 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*