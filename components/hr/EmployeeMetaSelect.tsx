'use client';

import { useMemo } from 'react';

import { CatalogSearchSelect } from '@/components/hr/CatalogSearchSelect';
import type { EmployeeMetaKind } from '@/lib/hr/employeeMetaOptions';
import { EMPLOYEE_META_KIND_LABELS } from '@/lib/hr/employeeMetaOptions';
import { useEmployeeMetaOptions } from '@/components/hr/useEmployeeMetaOptions';

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
  const resolvedValue = value !== undefined ? value : (defaultValue ?? '');

  const catalogOptions = useMemo(
    () => options.map((option) => ({ value: option.name, label: option.name, searchText: option.name })),
    [options]
  );

  const handleChange = (next: string) => {
    onValueChange?.(next);
    onChange?.();
  };

  return (
    <CatalogSearchSelect
      name={name}
      value={resolvedValue}
      onChange={handleChange}
      options={catalogOptions}
      disabled={disabled}
      loading={loading}
      placeholder={loading ? 'Loading…' : `Search ${EMPLOYEE_META_KIND_LABELS[kind].toLowerCase()}…`}
      inputClassName={fieldClass}
      allowLegacyValue
    />
  );
}
