'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function DispatchDeliveryNoteRedirectPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    const nextPath = `/stock/dispatch/delivery-note${query ? `?${query}` : ''}`;
    if (pathname !== nextPath) {
      router.replace(nextPath);
    }
  }, [pathname, router, searchParams]);

  return null;
}
