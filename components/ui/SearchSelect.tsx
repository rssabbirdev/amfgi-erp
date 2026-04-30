'use client';

import { useState, useRef, useEffect, useId, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { searchItems } from '@/lib/utils/fuzzyMatch';

interface SearchSelectProps<T extends { id: string; label: string; searchText?: string }> {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  onInputChange?: (value: string) => void;
  onBlurInputValue?: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  renderItem?: (item: T, isHighlighted: boolean) => React.ReactNode;
  minCharactersToSearch?: number;
  showMinCharactersHint?: boolean;
  openOnFocus?: boolean;
  clearInputOnFocus?: boolean;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  dropdownInPortal?: boolean;
  allowClearButton?: boolean;
  clearOnEmptyInput?: boolean;
}

export default function SearchSelect<T extends { id: string; label: string; searchText?: string }>(
  props: SearchSelectProps<T>
) {
  const {
    items,
    value,
    onChange,
    onInputChange,
    onBlurInputValue,
    placeholder = 'Search...',
    label,
    required,
    disabled,
    renderItem,
    minCharactersToSearch = 0,
    showMinCharactersHint = false,
    openOnFocus = false,
    clearInputOnFocus = false,
    inputProps,
    dropdownInPortal = false,
    allowClearButton = true,
    clearOnEmptyInput = false,
  } = props;

  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const mergedInputClassName = ['w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-white', inputProps?.className]
    .filter(Boolean)
    .join(' ');

  const hasEnoughInput = input.trim().length >= minCharactersToSearch;
  const filteredItems = hasEnoughInput ? searchItems(items, input, 0.2) : [];
  const selectedItem = items.find((item) => item.id === value);

  // Reset input when opening
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!dropdownInPortal || !isOpen) return;

    const updatePosition = () => {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        left: rect.left,
        top: rect.bottom + 4,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [dropdownInPortal, isOpen]);

  const displayedValue = isOpen ? input : selectedItem?.label ?? (value ? input : '');

  const handleSelect = (itemId: string) => {
    onChange(itemId);
    const item = items.find((i) => i.id === itemId);
    if (item) {
      setInput(item.label);
    }
    setIsOpen(false);
    setHighlightedIdx(0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
    if (clearOnEmptyInput && newValue.trim().length === 0 && value) {
      onChange('');
    }
    onInputChange?.(newValue);
    setIsOpen(true);
    setHighlightedIdx(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && filteredItems.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
    }

    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIdx((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIdx((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredItems[highlightedIdx]) {
          handleSelect(filteredItems[highlightedIdx].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resultsDropdown = (
    <div
      ref={dropdownRef}
      id={listboxId}
      role="listbox"
      className="z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
      style={
        dropdownInPortal && dropdownStyle
          ? {
              position: 'fixed',
              left: dropdownStyle.left,
              top: dropdownStyle.top,
              width: dropdownStyle.width,
            }
          : undefined
      }
    >
      {filteredItems.map((item, idx) => (
        <button
          key={item.id}
          type="button"
          onClick={() => handleSelect(item.id)}
          onMouseEnter={() => setHighlightedIdx(idx)}
          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
            idx === highlightedIdx
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-400'
              : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          {renderItem ? (
            renderItem(item, idx === highlightedIdx)
          ) : (
            <div>
              <div className="font-medium">{item.label}</div>
              {item.searchText && (
                <div className="text-xs text-slate-500 dark:text-slate-400">{item.searchText}</div>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
          {required && ' *'}
        </label>
      )}

      <div className="relative">
        <input
          {...inputProps}
          ref={inputRef}
          type="text"
          value={displayedValue}
          onChange={(e) => {
            handleInputChange(e);
            inputProps?.onChange?.(e);
          }}
          onKeyDown={(e) => {
            handleKeyDown(e);
            if (!e.defaultPrevented) {
              inputProps?.onKeyDown?.(e);
            }
          }}
          onFocus={(e) => {
            setInput(clearInputOnFocus ? '' : (selectedItem?.label ?? input));
            if (openOnFocus) {
              setIsOpen(true);
              setHighlightedIdx(0);
            }
            inputProps?.onFocus?.(e);
          }}
          onBlur={(e) => {
            onBlurInputValue?.(input);
            inputProps?.onBlur?.(e);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={mergedInputClassName}
          autoComplete="off"
          role="combobox"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />

        {allowClearButton && input && (
          <button
            type="button"
            onClick={() => {
              setInput('');
              onChange('');
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-900 dark:hover:text-white"
          >
            x
          </button>
        )}
      </div>

      {isOpen && filteredItems.length > 0
        ? dropdownInPortal && dropdownStyle
          ? createPortal(resultsDropdown, document.body)
          : <div className="absolute left-0 right-0 top-full">{resultsDropdown}</div>
        : null}

      {isOpen && !hasEnoughInput && minCharactersToSearch > 0 && showMinCharactersHint && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Type at least {minCharactersToSearch} character{minCharactersToSearch === 1 ? '' : 's'} to search
          </p>
        </div>
      )}

      {isOpen && hasEnoughInput && input && filteredItems.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">No matches found for &quot;{input}&quot;</p>
        </div>
      )}
    </div>
  );
}
