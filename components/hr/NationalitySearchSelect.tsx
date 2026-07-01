'use client';

import { useMemo } from 'react';

import SearchSelect from '@/components/ui/SearchSelect';
import { NATIONALITY_OPTIONS } from '@/lib/hr/employeeMeta';
import { displayNationalityCountryName } from '@/lib/hr/countryNames';
import { cn } from '@/lib/utils';

const nationalityItems = NATIONALITY_OPTIONS.map((country) => ({
  id: country,
  label: country,
  searchText: country,
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
  placeholder = 'Search country…',
}: NationalitySearchSelectProps) {
  const items = useMemo(() => nationalityItems, []);
  const resolvedValue = displayNationalityCountryName(value);

  return (
    <div className={cn('min-w-0', className)}>
      {name ? <input type="hidden" name={name} value={resolvedValue} /> : null}
      <SearchSelect
        items={items}
        value={resolvedValue}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        minCharactersToSearch={0}
        dropdownInPortal
        allowClearButton={false}
        clearOnEmptyInput
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
