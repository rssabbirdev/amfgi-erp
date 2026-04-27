/**
 * External party lists (clients / suppliers) — server-side only.
 * @see API-party-lists.md
 *
 * Env (same machine / deployment secrets):
 *   PARTY_LISTS_API_BASE_URL   — deployed app root, e.g. https://example.com/AccountsHelper
 *   PARTY_LISTS_API_BEARER_TOKEN — Bearer token from the source app Settings
 * Optional overrides (full URL, same Bearer token) if an endpoint lives elsewhere:
 *   PARTY_LISTS_API_CLIENTS_URL, PARTY_LISTS_API_SUPPLIERS_URL
 */

export type PartyListContact = {
  id: number;
  contact_name: string;
  email?: string | null;
  phone?: string | null;
  sort_order?: number;
  created_at?: string;
};

export type PartyListParty = {
  id: number;
  name: string;
  email?: string | null;
  trade_license_number?: string | null;
  trade_license_authority?: string | null;
  trade_license_expiry?: string | null;
  trn_number?: string | null;
  trn_expiry?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  contacts?: PartyListContact[];
};

/**
 * Normalize env base URL: trim slashes, strip accidental `/api/v1` or full `.php` paths
 * so we always append `/api/v1/clients.php` (or suppliers) once.
 */
export function normalizePartyListsBaseUrl(raw: string): string {
  let b = raw.trim().replace(/\/+$/, '');
  if (!b) return b;
  b = b.replace(/\/api\/v1\/clients\.php$/i, '');
  b = b.replace(/\/api\/v1\/suppliers\.php$/i, '');
  b = b.replace(/\/api\/v1$/i, '');
  return b.replace(/\/+$/, '');
}

/**
 * Env value should be the raw hex token only. Users often paste `Bearer …` or full header lines;
 * Postman also hides the scheme in the UI — strip duplicates so we send a single `Bearer <token>`.
 */
function normalizePartyListsBearerToken(raw: string): string {
  let t = raw
    .trim()
    .replace(/\u200b/g, '')
    .replace(/\r/g, '');
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/^authorization:\s*bearer\s+/i, '').trim();
  t = t.replace(/^bearer\s+/i, '').trim();
  return t;
}

export function getPartyListsApiConfig(): { baseUrl: string; token: string } | null {
  const baseUrl = normalizePartyListsBaseUrl(process.env.PARTY_LISTS_API_BASE_URL ?? '');
  const token = normalizePartyListsBearerToken(process.env.PARTY_LISTS_API_BEARER_TOKEN ?? '');
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

/** Parses party API date strings (Y-m-d or ISO). Exported for seed and API routes. */
export function parsePartyListDateInput(s: string | null | undefined): Date | null {
  if (s == null || String(s).trim() === '') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapPartyToCustomerFields(p: PartyListParty) {
  const sorted = [...(p.contacts ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const primary = sorted[0];
  return {
    name: p.name.trim(),
    email: p.email?.trim() || null,
    contactPerson: primary?.contact_name?.trim() || null,
    phone: primary?.phone?.trim() || null,
    tradeLicenseNumber: p.trade_license_number?.trim() || null,
    tradeLicenseAuthority: p.trade_license_authority?.trim() || null,
    tradeLicenseExpiry: parsePartyListDateInput(p.trade_license_expiry ?? undefined),
    trnNumber: p.trn_number?.trim() || null,
    trnExpiry: parsePartyListDateInput(p.trn_expiry ?? undefined),
    contacts: sorted,
  };
}

function buildPartyListUrl(baseUrl: string, file: 'clients.php' | 'suppliers.php'): string {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/api/v1/${file}`;
}

function resolvePartyListRequestUrl(baseUrl: string, file: 'clients.php' | 'suppliers.php'): string {
  const overrideKey =
    file === 'clients.php' ? 'PARTY_LISTS_API_CLIENTS_URL' : 'PARTY_LISTS_API_SUPPLIERS_URL';
  const override = (process.env[overrideKey] ?? '').trim();
  if (override) return override;
  return buildPartyListUrl(baseUrl, file);
}

async function fetchPartyListArray(
  baseUrl: string,
  token: string,
  file: 'clients.php' | 'suppliers.php',
  arrayKey: 'clients' | 'suppliers'
): Promise<PartyListParty[]> {
  const url = resolvePartyListRequestUrl(baseUrl, file);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (res.status === 404) {
      const looksLikeDocPath = /\/api\/v1\/(clients|suppliers)\.php$/i.test(url);
      const hint = looksLikeDocPath
        ? `AMFGI requested the documented path. A 404 here means the **party app** did not serve that file (wrong deployment, older app without suppliers API, URL rewrite, or different filename). Try opening the same URL with curl and your Bearer token; if clients.php works but suppliers.php does not, update the party app or set PARTY_LISTS_API_SUPPLIERS_URL to the working full URL.`
        : `Set PARTY_LISTS_API_BASE_URL to the other app’s root (include any folder), e.g. https://host/AccountsHelper — not only https://host. Or set PARTY_LISTS_API_CLIENTS_URL / PARTY_LISTS_API_SUPPLIERS_URL to the exact working endpoint URLs.`;
      throw new Error(`HTTP 404 — no JSON at this URL. ${hint} Requested: ${url}`);
    }
    throw new Error(
      `Party lists API returned non-JSON (HTTP ${res.status}). ${snippet ? `Body starts with: ${snippet}` : 'Empty body.'} URL: ${url}`
    );
  }
  if (!res.ok) {
    const msg =
      typeof json === 'object' && json && 'message' in json
        ? String((json as { message?: string }).message)
        : text.slice(0, 200);
    throw new Error(msg || `Party lists API error ${res.status} (${url})`);
  }
  if (typeof json !== 'object' || json === null || !(arrayKey in json)) {
    throw new Error(`Invalid ${arrayKey} response from ${url}`);
  }
  const arr = (json as Record<string, unknown>)[arrayKey];
  if (!Array.isArray(arr)) throw new Error(`Invalid ${arrayKey} array from ${url}`);
  return arr as PartyListParty[];
}

export async function fetchExternalClients(): Promise<PartyListParty[]> {
  const cfg = getPartyListsApiConfig();
  if (!cfg) {
    throw new Error(
      'Party lists API is not configured. Set PARTY_LISTS_API_BASE_URL and PARTY_LISTS_API_BEARER_TOKEN.'
    );
  }
  return fetchPartyListArray(cfg.baseUrl, cfg.token, 'clients.php', 'clients');
}

export async function fetchExternalSuppliers(): Promise<PartyListParty[]> {
  const cfg = getPartyListsApiConfig();
  if (!cfg) {
    throw new Error(
      'Party lists API is not configured. Set PARTY_LISTS_API_BASE_URL and PARTY_LISTS_API_BEARER_TOKEN.'
    );
  }
  return fetchPartyListArray(cfg.baseUrl, cfg.token, 'suppliers.php', 'suppliers');
}
