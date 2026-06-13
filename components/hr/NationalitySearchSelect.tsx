'use client';

import { useMemo } from 'react';

import SearchSelect from '@/components/ui/SearchSelect';
import { NATIONALITY_OPTIONS } from '@/lib/hr/employeeMeta';
import { cn } from '@/lib/utils';

const nationalityItems = NATIONALITY_OPTIONS.map((nationality) => ({
  id: nationality,
  label: nationality,
  searchText: nationality,
}));

type NationalitySearchSelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** When set, writes into native form submit via hidden input. */
  name?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
};

export function NationalitySearchSelect({
  value,
  onChange,
  disabled,
  name,
  className,
  inputClassName,
  placeholder = 'Search nationality…',
}: NationalitySearchSelectProps) {
  const items = useMemo(() => nationalityItems, []);

  return (
    <div className={cn('min-w-0', className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <SearchSelect
        items={items}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        minCharactersToSearch={0}
        openOnFocus
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
