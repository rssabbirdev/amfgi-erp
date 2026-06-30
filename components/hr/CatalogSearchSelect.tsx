'use client';

import { useMemo } from 'react';

import SearchSelect from '@/components/ui/SearchSelect';
import type { CatalogOption } from '@/lib/hr/employeeFieldOptions';
import { cn } from '@/lib/utils';

type CatalogSearchSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: CatalogOption[];
  disabled?: boolean;
  loading?: boolean;
  /** When set, writes into native form submit via hidden input. */
  name?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  /** Include the current value when it is not in `options` (legacy catalog values). */
  allowLegacyValue?: boolean;
};

export function CatalogSearchSelect({
  value,
  onChange,
  options,
  disabled,
  loading = false,
  name,
  className,
  inputClassName,
  placeholder = 'Search…',
  allowLegacyValue = true,
}: CatalogSearchSelectProps) {
  const items = useMemo(() => {
    const base = options.map((option) => ({
      id: option.value,
      label: option.label,
      searchText: option.searchText ?? option.label,
    }));
    const trimmed = value.trim();
    if (!allowLegacyValue || !trimmed || base.some((item) => item.id === trimmed)) {
      return base;
    }
    return [{ id: trimmed, label: `${trimmed} (not in catalog)`, searchText: trimmed }, ...base];
  }, [allowLegacyValue, options, value]);

  return (
    <div className={cn('min-w-0', className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <SearchSelect
        items={items}
        value={value}
        onChange={onChange}
        placeholder={loading ? 'Loading…' : placeholder}
        disabled={disabled || loading}
        loading={loading}
        minCharactersToSearch={0}
        dropdownInPortal
        inputProps={{
          className: cn(
            'h-8 w-full rounded-md border px-2 py-1 text-xs shadow-inner focus:outline-none focus:ring-1 disabled:opacity-50',
            inputClassName
          ),
        }}
      />
    </div>
  );
}
