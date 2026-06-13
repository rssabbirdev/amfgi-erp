'use client';

import { useEffect, useMemo, useState } from 'react';

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

type EmployeeMetaSelectProps = {
  kind: EmployeeMetaKind;
  name: string;
  defaultValue?: string | null;
  value?: string;
  disabled?: boolean;
  fieldClass: string;
  emptyLabel?: string;
  onChange?: () => void;
  onValueChange?: (value: string) => void;
};

export function EmployeeMetaSelect({
  kind,
  name,
  defaultValue,
  value,
  disabled,
  fieldClass,
  emptyLabel = '-',
  onChange,
  onValueChange,
}: EmployeeMetaSelectProps) {
  const { options, loading } = useEmployeeMetaOptions(kind, true);
  const resolvedDefault = value !== undefined ? value : (defaultValue ?? '');
  const legacyValue = useMemo(() => {
    const v = String(resolvedDefault ?? '').trim();
    if (!v) return null;
    if (options.some((option) => option.name === v)) return null;
    return v;
  }, [resolvedDefault, options]);

  const selectProps =
    value !== undefined
      ? {
          value,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
            onValueChange?.(e.target.value);
            onChange?.();
          },
        }
      : {
          defaultValue: defaultValue ?? '',
          onChange,
        };

  return (
    <select
      name={name}
      {...selectProps}
      disabled={disabled || loading}
      className={fieldClass}
    >
      <option value="">{loading ? 'Loading…' : emptyLabel}</option>
      {legacyValue ? (
        <option value={legacyValue}>{legacyValue} (not in catalog)</option>
      ) : null}
      {options.map((option) => (
        <option key={option.id} value={option.name}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
