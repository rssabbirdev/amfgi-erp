'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DispatchMaterialsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to new dispatch location
    router.replace('/stock/dispatch/entry');
  }, [router]);

  return null;
}
