/**
 * Optional hostname allowlist for integration API keys (Origin / Referer).
 * Best-effort: server-to-server callers may need to send `Origin: https://your.registered.host`.
 */

export function normalizeDomainOrUrlToHostname(input: string): string | null {
  const t = input.trim().toLowerCase();
  if (!t) return null;
  try {
    const url = t.includes('://') ? new URL(t) : new URL(`https://${t}`);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      return host || null;
    }
    return host;
  } catch {
    return null;
  }
}

/** Normalize list from UI/API (strings or full URLs) to lowercase hostnames; drop invalid. */
export function normalizeAllowedDomainsList(raw: unknown): string[] {
  if (raw == null) return [];
  const parts: string[] = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string')
    : typeof raw === 'string'
      ? raw.split(/[\n,\s]+/)
      : [];
  const out = new Set<string>();
  for (const p of parts) {
    const h = normalizeDomainOrUrlToHostname(p);
    if (h) out.add(h);
  }
  return [...out];
}

export function parseStoredAllowedDomains(json: unknown): string[] {
  if (json == null) return [];
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.toLowerCase());
}

/** Host from Origin, then Referer; null if neither usable. */
export function requestClientHost(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      /* fall through */
    }
  }
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).hostname.toLowerCase();
    } catch {
      /* fall through */
    }
  }
  return null;
}

/**
 * `allowed` empty → allow. Non-empty → request must present Origin or Referer whose host
 * equals an entry or is a subdomain of an entry (e.g. `app.partner.com` matches `partner.com`).
 */
export function isRequestHostAllowed(host: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!host) return false;
  const h = host.toLowerCase();
  return allowed.some((rule) => {
    const r = rule.toLowerCase();
    if (h === r) return true;
    if (h.endsWith(`.${r}`)) return true;
    return false;
  });
}

export function integrationDomainCheck(
  req: Request,
  allowedDomainsJson: unknown
): { ok: true } | { ok: false; reason: string } {
  const allowed = parseStoredAllowedDomains(allowedDomainsJson);
  if (allowed.length === 0) return { ok: true };
  const host = requestClientHost(req);
  if (!isRequestHostAllowed(host, allowed)) {
    return {
      ok: false,
      reason:
        'Request blocked: Origin or Referer hostname is not on this credential’s allowed domains list. Server integrations should send a matching Origin header (e.g. Origin: https://your-app.example.com).',
    };
  }
  return { ok: true };
}
