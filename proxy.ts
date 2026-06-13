import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { P, type Permission } from '@/lib/permissions';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';

type RoutePermissionRule = {
  prefix: string;
  perm?: Permission;
  legacyPerms?: Permission[];
  anyPerms?: Permission[];
};

// Routes that require a specific permission (longest prefix wins at runtime)
const ROUTE_PERMISSIONS: RoutePermissionRule[] = [
  { prefix: '/admin', perm: 'user.view' },
  { prefix: '/reports', perm: 'report.view' },
  { prefix: '/stock/job-budget', perm: P.STOCK_JOB_BUDGET_VIEW },
  { prefix: '/stock/daily-quantity-log', perm: P.STOCK_PRODUCTION_LOG_VIEW },
  { prefix: '/stock/warehouse-transfers', perm: P.STOCK_WAREHOUSE_TRANSFER_VIEW },
  { prefix: '/stock/count-session', perm: P.STOCK_COUNT_SESSION_VIEW },
  { prefix: '/stock/issue-reconcile', perm: 'transaction.reconcile' },
  { prefix: '/stock/non-stock-reconcile', perm: 'transaction.reconcile' },
  { prefix: '/customers/jobs', perm: 'job.view' },
  { prefix: '/customers', perm: 'customer.view' },
  { prefix: '/suppliers', perm: P.SUPPLIER_VIEW, legacyPerms: [P.TXN_STOCK_IN] },
  { prefix: '/jobs', perm: 'job.view' },
  { prefix: '/materials', perm: 'material.view' },
  { prefix: '/settings/print-template', anyPerms: [P.SETTINGS_PRINT_FORMAT, P.SETTINGS_MANAGE] },
  { prefix: '/settings/print-format', anyPerms: [P.SETTINGS_PRINT_FORMAT, P.SETTINGS_MANAGE] },
  { prefix: '/settings/storage', anyPerms: [P.SETTINGS_STORAGE, P.SETTINGS_MANAGE] },
  { prefix: '/settings/media', anyPerms: [P.SETTINGS_MEDIA, P.SETTINGS_MANAGE] },
  { prefix: '/settings/email', anyPerms: [P.SETTINGS_EMAIL, P.SETTINGS_MANAGE] },
  { prefix: '/settings/api', anyPerms: [P.SETTINGS_API, P.SETTINGS_MANAGE] },
  {
    prefix: '/settings',
    anyPerms: [
      P.SETTINGS_PRINT_FORMAT,
      P.SETTINGS_STORAGE,
      P.SETTINGS_MEDIA,
      P.SETTINGS_EMAIL,
      P.SETTINGS_API,
      P.SETTINGS_MANAGE,
    ],
  },
];

const SORTED_ROUTE_PERMISSIONS = [...ROUTE_PERMISSIONS].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

/**
 * Next.js 16 `proxy` (Node runtime). Do not wrap this file in `auth((req) => …)`:
 * that helper clones `NextResponse.next()` in a way that breaks continuation to
 * App Route handlers, so `/api/auth/*` returns HTML 404 and `signIn()` sees
 * "Unexpected token '<'" (ClientFetchError).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/docs/api') ||
    pathname.startsWith('/privacy-policy') ||
    pathname.startsWith('/terms-of-service') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/integrations/') ||
    pathname === '/unauthorized'
  ) {
    return NextResponse.next();
  }

  const session = await auth();

  if (!session?.user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  const selfServiceOnly = isEmployeeSelfServiceUser(session?.user);

  if (selfServiceOnly) {
    const allowedPagePrefixes = ['/me', '/unauthorized'];
    const allowedApiPrefixes = ['/api/me', '/api/auth'];
    const isAllowedPage = allowedPagePrefixes.some((prefix) => pathname.startsWith(prefix));
    const isAllowedApi = allowedApiPrefixes.some((prefix) => pathname.startsWith(prefix));

    if (pathname.startsWith('/api/')) {
      if (!isAllowedApi) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (!isAllowedPage) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }
  }

  if (!session.user.isSuperAdmin) {
    const matched = SORTED_ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix));
    if (matched) {
      const perms = session.user.permissions;
      const allowed = matched.anyPerms
        ? matched.anyPerms.some((p) => perms.includes(p))
        : perms.includes(matched.perm!) ||
          (matched.legacyPerms?.some((legacyPerm) => perms.includes(legacyPerm)) ?? false);
      if (!allowed) {
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }
  }

  if (
    !session.user.isSuperAdmin &&
    !session.user.activeCompanyId &&
    !pathname.startsWith('/select-company') &&
    !pathname.startsWith('/api/')
  ) {
    return NextResponse.redirect(new URL('/select-company', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
