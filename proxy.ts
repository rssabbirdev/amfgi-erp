import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Permission } from '@/lib/permissions';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';

// Routes that require a specific permission
const ROUTE_PERMISSIONS: Array<{ prefix: string; perm: Permission }> = [
  { prefix: '/admin', perm: 'user.view' },
  { prefix: '/reports', perm: 'report.view' },
  { prefix: '/stock/issue-reconcile', perm: 'transaction.reconcile' },
  { prefix: '/stock/non-stock-reconcile', perm: 'transaction.reconcile' },
  { prefix: '/customers/jobs', perm: 'job.view' },
  { prefix: '/customers', perm: 'customer.view' },
  { prefix: '/jobs', perm: 'job.view' },
  { prefix: '/materials', perm: 'material.view' },
];

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
    pathname.startsWith('/privacy-policy') ||
    pathname.startsWith('/terms-of-service') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/integrations/') ||
    pathname.startsWith('/docs') ||
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
    const matched = ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix));
    if (matched && !session.user.permissions.includes(matched.perm)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
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
