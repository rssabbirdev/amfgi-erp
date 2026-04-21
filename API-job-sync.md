# Project Management Job Sync API

Server-to-server API for creating/updating **parent jobs** in AMFGI from an external Project Management system.

## Endpoint

- `POST /api/integrations/jobs/upsert`

## Authentication

Use one of:

- `x-api-key: amfgi_...`
- `Authorization: Bearer amfgi_...`

Keys are generated from **Settings → API & Credentials** and shown once.

**Scope:** the integration key is only accepted on integration routes (today: `POST /api/integrations/jobs/upsert`). It does **not** replace a user session for the rest of the ERP API.

## Allowed domains (optional per credential)

You can store a list of allowed **hostnames** on the credential (Settings UI: comma- or newline-separated). When that list is **non-empty**, each request must include an `Origin` or `Referer` header whose host:

- equals one of the listed hostnames, or
- is a **subdomain** of a listed hostname (e.g. `app.partner.com` matches `partner.com`).

If the list is **empty**, no domain check is applied (only the API key is validated).

Server-to-server clients (no browser) should send an explicit header, for example:

`Origin: https://your-registered-app.example.com`

A public route catalog lives at **`/docs/api`**.

## Idempotency / replay protection

Optional but recommended header:

- `x-idempotency-key: <unique-request-id>`

When reused for the same company, AMFGI returns the prior result instead of processing again.

## Company mapping

Every request must include:

- `companyExternalId` (must match AMFGI company `externalCompanyId`)

This ensures the key and company mapping are both valid.

## Parent job source policy (Phase 3)

Company setting **Parent Job Source Mode** controls local creation:

- `HYBRID`: local parent jobs + external API parent jobs
- `EXTERNAL_ONLY`: local parent job creation blocked; parent jobs must come from API

In `EXTERNAL_ONLY`, local **variations** are still allowed.

## Request body

```json
{
  "companyExternalId": "PM-COMPANY-001",
  "job": {
    "externalJobId": "PM-JOB-123",
    "jobNumber": "JOB-2026-123",
    "customerExternalId": 55001,
    "customerName": "Acme LLC",
    "description": "Main parent job",
    "site": "Jebel Ali",
    "projectName": "Project Alpha",
    "projectDetails": "Phase 1",
    "status": "ACTIVE",
    "startDate": "2026-04-13",
    "endDate": "2026-12-31",
    "quotationNumber": "QTN-55",
    "quotationDate": "2026-01-04",
    "lpoNumber": "LPO-77",
    "lpoDate": "2026-01-06",
    "lpoValue": 125000,
    "address": "Street, City",
    "locationName": "Google Map Label",
    "locationLat": 25.2048,
    "locationLng": 55.2708,
    "contacts": [
      {
        "label": "site",
        "name": "John Doe",
        "number": "+971500000000",
        "email": "john@example.com",
        "designation": "Engineer"
      }
    ],
    "contactPerson": "John Doe",
    "salesPerson": "Ali Khan",
    "externalUpdatedAt": "2026-04-13T07:50:00Z"
  }
}
```

Optional string **`job.contactPerson`**: primary site / job contact (same idea as customer **Contact person**). The **`contacts`** array remains available for extra rows (phone, email, labels).

## Customer matching (Phase 5)

Optional field on `job`:

- `customerExternalId` — positive integer from the PM / accounts system. When present, it maps to AMFGI `Customer.externalPartyId` for the same company.

Resolution order when `customerExternalId` is set:

1. Customer with that `externalPartyId` → use it; `customerName` from the payload updates the AMFGI customer name if it differs (PM as display source).
2. Else, customer with matching `customerName` and **no** `externalPartyId` → that row is updated with `customerExternalId` and used.
3. Else, customer with matching `customerName` but a **different** `externalPartyId` → **409 Conflict** (ambiguous; fix data or payload).
4. Else → new customer with `customerName` and `externalPartyId`.

When `customerExternalId` is omitted, behavior is unchanged: match or create by `customerName` only (no `externalPartyId` set).

## Variations / parent link (Phase 7)

Optional on `job`:

- `parentExternalJobId` — the parent’s **`externalJobId`** already stored in AMFGI (same company). The upserted row becomes a **variation** (`parentJobId` set).

Rules:

- Parent job must exist first (sync parent, then variations).
- `parentExternalJobId` must reference a **parent** job (not another variation).
- Must differ from `externalJobId`.
- A job that **already has variations** cannot be turned into a variation (returns **400**).
- Omitting `parentExternalJobId` on update leaves the existing parent link unchanged; including it updates `parentJobId` when valid.

## Behavior

- Upsert key: `companyId + externalJobId`
- Customer resolution: see **Customer matching (Phase 5)** above.
- `source` is set to `EXTERNAL_API`.
- If `lpoValue` changed, history row is added in `JobLpoValueHistory`.

## Response

- `201` when created
- `200` when updated
- `400` when `parentExternalJobId` is invalid (unknown parent, not a parent job, equals `externalJobId`, or parent already has variations)
- `409` when `customerExternalId` + `customerName` conflict with an existing customer (see **Customer matching**)
- standard AMFGI JSON:

```json
{
  "success": true,
  "data": {
    "created": true,
    "job": {
      "id": "...",
      "jobNumber": "JOB-2026-123",
      "externalJobId": "PM-JOB-123",
      "parentJobId": null,
      "lpoValue": 125000
    }
  }
}
```

## Playground

Use **Settings → API & Credentials → Integration Playground** for quick manual tests from within AMFGI.

## Sync logs (inside AMFGI)

- Settings UI shows recent logs under **Recent Integration Logs** (with **Load more** cursor pagination).
- Backend: `GET /api/settings/integration-logs`
  - Query: `limit` (1–200, default 50), optional `status`, `from`, `to` (datetime-local compatible), optional `cursor` (log `id` from the previous page’s `nextCursor`).
  - Response: `{ items: [...], nextCursor: string | null }` — pass `nextCursor` as `cursor` for the next page.
- Each log contains status, entity key (`externalJobId`), timestamp, request/response bodies, and error message (if failed). **Download JSON** exports the selected log from Settings.
- Failed inbound job logs can be retried from Settings UI (**Retry** button), which creates `retry_success` / `retry_error` log entries.
