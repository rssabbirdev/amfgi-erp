'use client';

import { useEffect, useState } from 'react';

import type { EmployeeMetaKind } from '@/lib/hr/employeeMetaOptions';
import { readApiJson } from '@/lib/utils/readApiResponse';

type MetaOption = {
  id: string;
  kind: EmployeeMetaKind;
  name: string;
  isActive: boolean;
};

export function useEmployeeMetaOptions(kind: EmployeeMetaKind, activeOnly = true) {
  const [options, setOptions] = useState<MetaOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetch(
        `/api/hr/employee-meta-options?kind=${encodeURIComponent(kind)}${activeOnly ? '&activeOnly=1' : ''}`,
        { cache: 'no-store' }
      );
      const json = await readApiJson<MetaOption[]>(res);
      if (!cancelled && res.ok && json?.success) {
        setOptions((json.data ?? []) as MetaOption[]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, activeOnly]);

  return { options, loading };
}
