import { auth }        from './auth';
import { NextResponse } from 'next/server';
import type { Permission } from '@/lib/permissions';

// Routes that require a specific permission
const ROUTE_PERMISSIONS: Array<{ prefix: string; perm: Permission }> = [
  { prefix: '/admin',    perm: 'user.view'      },
  { prefix: '/reports',  perm: 'report.view'    },
  { prefix: '/customers', perm: 'customer.view' },
  { prefix: '/jobs',     perm: 'job.view'       },
  { prefix: '/materials', perm: 'material.view' },
];

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Always allow
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/unauthorized'
  ) {
    return NextResponse.next();
  }

  // Not authenticated → login
  if (!session?.user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // Permission check for non-superadmin
  if (!session.user.isSuperAdmin) {
    const matched = ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix));
    if (matched && !session.user.permissions.includes(matched.perm)) {
      return NextResponse.redirect(new URL('/unauthorized', req.url));
    }
  }

  // Company guard — must have selected a company
  if (
    !session.user.isSuperAdmin &&
    !session.user.activeCompanyId &&
    !pathname.startsWith('/select-company') &&
    !pathname.startsWith('/api/')
  ) {
    return NextResponse.redirect(new URL('/select-company', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
