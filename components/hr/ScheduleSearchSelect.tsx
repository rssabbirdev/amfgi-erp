'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SearchSelect from '@/components/ui/SearchSelect';

type ScheduleSearchSelectProps<T extends { id: string; label: string; searchText?: string }> = {
  value: string;
  onChange: (id: string) => void;
  onResolved?: (item: T | null) => void;
  /** Parent already loaded this entity — skips network resolve for the current value. */
  knownItem?: T | null;
  search: (query: string) => Promise<T[]>;
  resolveById?: (id: string) => Promise<T | null>;
  placeholder?: string;
  disabled?: boolean;
  minCharactersToSearch?: number;
  debounceMs?: number;
  renderItem?: (item: T, isHighlighted: boolean) => React.ReactNode;
  inputProps?: React.ComponentProps<typeof SearchSelect<T>>['inputProps'];
  dropdownInPortal?: boolean;
  allowClearButton?: boolean;
  clearOnEmptyInput?: boolean;
  passThroughArrowKeys?: boolean;
  /** Open the suggestion list on focus (e.g. job picker with minCharactersToSearch 0). */
  openOnFocus?: boolean;
  /** Preloaded suggestion rows (e.g. RTK-cached job list) to avoid refetch on first open. */
  seedItems?: T[];
  emptyAction?: {
    label?: string | ((query: string) => string);
    onAction: (query: string) => void;
  };
};

export default function ScheduleSearchSelect<T extends { id: string; label: string; searchText?: string }>({
  value,
  onChange,
  onResolved,
  knownItem = null,
  search,
  resolveById,
  placeholder = 'Type to search…',
  disabled,
  minCharactersToSearch = 1,
  debounceMs = 300,
  renderItem,
  inputProps,
  dropdownInPortal = true,
  allowClearButton,
  clearOnEmptyInput,
  passThroughArrowKeys,
  openOnFocus = false,
  seedItems,
  emptyAction,
}: ScheduleSearchSelectProps<T>) {
  const [items, setItems] = useState<T[]>(() => (knownItem ? [knownItem] : []));
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResolvedRef = useRef(onResolved);
  const resolvedValueRef = useRef<string | null>(null);

  onResolvedRef.current = onResolved;

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < minCharactersToSearch) {
        setItems([]);
        setLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const results = await search(trimmed);
        if (requestId !== requestIdRef.current) return;
        setItems(results);
      } catch {
        if (requestId === requestIdRef.current) setItems([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [minCharactersToSearch, search],
  );

  const handleInputChange = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (query.trim().length < minCharactersToSearch) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(() => {
        void runSearch(query);
      }, debounceMs);
    },
    [debounceMs, minCharactersToSearch, runSearch],
  );

  useEffect(() => {
    if (!value) {
      resolvedValueRef.current = null;
      return;
    }

    if (knownItem?.id === value) {
      setItems((current) =>
        current.some((item) => item.id === value) ? current : [knownItem, ...current]
      );
      if (resolvedValueRef.current !== value) {
        resolvedValueRef.current = value;
        onResolvedRef.current?.(knownItem);
      }
      return;
    }

    if (resolvedValueRef.current === value) return;

    let cancelled = false;
    void (async () => {
      const resolved = resolveById ? await resolveById(value) : null;
      if (cancelled || !resolved) return;
      resolvedValueRef.current = value;
      setItems((current) => (current.some((item) => item.id === resolved.id) ? current : [resolved, ...current]));
      onResolvedRef.current?.(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [knownItem, resolveById, value]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!seedItems?.length) return;
    setItems((current) => {
      const next = [...seedItems];
      for (const item of current) {
        if (!next.some((row) => row.id === item.id)) next.push(item);
      }
      return next;
    });
  }, [seedItems]);

  const handleInputFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (openOnFocus && minCharactersToSearch === 0 && items.length === 0) {
        void runSearch('');
      }
      const externalOnFocus = inputProps?.onFocus;
      if (externalOnFocus) externalOnFocus(e);
    },
    [inputProps, items.length, minCharactersToSearch, openOnFocus, runSearch],
  );

  const mergedInputProps = useMemo(
    () => ({
      ...inputProps,
      onFocus: handleInputFocus,
    }),
    [handleInputFocus, inputProps],
  );

  return (
    <SearchSelect
      items={items}
      value={value}
      onChange={onChange}
      onInputChange={handleInputChange}
      placeholder={placeholder}
      disabled={disabled}
      minCharactersToSearch={minCharactersToSearch}
      showMinCharactersHint
      serverFiltered
      loading={loading}
      renderItem={renderItem}
      inputProps={mergedInputProps}
      dropdownInPortal={dropdownInPortal}
      allowClearButton={allowClearButton}
      clearOnEmptyInput={clearOnEmptyInput}
      passThroughArrowKeys={passThroughArrowKeys}
      openOnFocus={openOnFocus}
      emptyAction={emptyAction}
    />
  );
}
