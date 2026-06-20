'use client';

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useId,
  type InputHTMLAttributes,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { attachBlockInputWheelChange, detachBlockInputWheelChange } from '@/lib/utils/blockInputWheelChange';
import { searchItems } from '@/lib/utils/fuzzyMatch';

const DROPDOWN_Z_CLASS = 'z-[200]';

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
  /** Extra classes on the results list (e.g. z-[200] inside overflow/stacking contexts). */
  dropdownClassName?: string;
  allowClearButton?: boolean;
  clearOnEmptyInput?: boolean;
  /** When true, `items` are already filtered (e.g. server search); skip client fuzzy match. */
  serverFiltered?: boolean;
  loading?: boolean;
  /** When true, ↑/↓ move grid focus while closed; while open, ↑/↓ navigate suggestions. */
  passThroughArrowKeys?: boolean;
  /** Called after a value is chosen (click, Enter, or Tab on a suggestion). */
  onAfterSelect?: (itemId: string) => void;
  /** Shown at the bottom of the empty-results panel (e.g. create-new action). */
  emptyAction?: {
    label?: string | ((query: string) => string);
    onAction: (query: string) => void;
  };
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
    dropdownInPortal = true,
    dropdownClassName,
    allowClearButton = true,
    clearOnEmptyInput = false,
    serverFiltered = false,
    loading = false,
    passThroughArrowKeys = false,
    onAfterSelect,
    emptyAction,
  } = props;

  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<{
    left: number;
    top: number;
    width: number;
    placement: 'above' | 'below';
  } | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ignoreBlurRef = useRef(false);
  const listboxId = useId();
  const mergedInputClassName = ['w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-white', inputProps?.className]
    .filter(Boolean)
    .join(' ');

  const hasEnoughInput = input.trim().length >= minCharactersToSearch;
  const filteredItems = hasEnoughInput
    ? serverFiltered
      ? items
      : searchItems(items, input, 0.2)
    : [];
  const selectedItem = items.find((item) => item.id === value);

  useEffect(() => {
    if (!value) {
      setInput('');
    }
  }, [value]);

  // Reset input when opening
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    dropdownRef.current
      ?.querySelector<HTMLElement>('[data-suggestion-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, isOpen]);

  const updateDropdownPosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const maxHeight = 256;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < maxHeight && spaceAbove > spaceBelow;
    setDropdownStyle({
      left: rect.left,
      top: openAbove ? rect.top - gap : rect.bottom + gap,
      width: rect.width,
      placement: openAbove ? 'above' : 'below',
    });
  }, []);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el || !isOpen) return;
    attachBlockInputWheelChange(el);
    return () => detachBlockInputWheelChange(el);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!dropdownInPortal || !isOpen) return;
    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [dropdownInPortal, isOpen, updateDropdownPosition]);

  const displayedValue = isOpen ? input : selectedItem?.label ?? (value ? input : '');

  const handleSelect = (itemId: string) => {
    onChange(itemId);
    const item = items.find((i) => i.id === itemId);
    if (item) {
      setInput(item.label);
    }
    setIsOpen(false);
    setHighlightedIdx(0);
    onAfterSelect?.(itemId);
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
    const isVerticalArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown';

    if (passThroughArrowKeys && !isOpen && isVerticalArrow) {
      return;
    }

    if (!passThroughArrowKeys && !isOpen && filteredItems.length > 0 && isVerticalArrow) {
      e.preventDefault();
      setIsOpen(true);
      return;
    }

    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIdx((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIdx((prev) =>
          prev > 0 ? prev - 1 : Math.max(0, filteredItems.length - 1)
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredItems[highlightedIdx]) {
          handleSelect(filteredItems[highlightedIdx].id);
        }
        break;
      case 'Tab':
        if (filteredItems[highlightedIdx]) {
          e.preventDefault();
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

  const portalDropdownStyle: CSSProperties | undefined =
    dropdownInPortal && dropdownStyle
      ? {
          position: 'fixed',
          left: dropdownStyle.left,
          top: dropdownStyle.top,
          width: dropdownStyle.width,
          transform: dropdownStyle.placement === 'above' ? 'translateY(-100%)' : undefined,
        }
      : undefined;

  const dropdownSurfaceClass = [
    'max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900',
    dropdownInPortal ? DROPDOWN_Z_CLASS : 'z-[200]',
    dropdownClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const renderFloatingPanel = (content: React.ReactNode, attachListbox = false) => {
    const panel = (
      <div
        ref={dropdownRef}
        id={attachListbox ? listboxId : undefined}
        role={attachListbox ? 'listbox' : undefined}
        className={dropdownSurfaceClass}
        style={portalDropdownStyle}
        onWheel={(event) => event.stopPropagation()}
      >
        {content}
      </div>
    );
    if (dropdownInPortal && portalMounted && typeof document !== 'undefined') {
      return createPortal(panel, document.body);
    }
    return <div className="absolute left-0 right-0 top-full z-[200] mt-1">{panel}</div>;
  };

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
            const nextInput = clearInputOnFocus ? '' : (selectedItem?.label ?? input);
            setInput(nextInput);
            if (openOnFocus) {
              setIsOpen(true);
              setHighlightedIdx(0);
            }
            const cursorPos = nextInput.length;
            requestAnimationFrame(() => {
              inputRef.current?.setSelectionRange(cursorPos, cursorPos);
            });
            inputProps?.onFocus?.(e);
          }}
          onBlur={(e) => {
            if (ignoreBlurRef.current) {
              ignoreBlurRef.current = false;
              inputProps?.onBlur?.(e);
              return;
            }
            setIsOpen(false);
            if (selectedItem) {
              setInput(selectedItem.label);
            } else if (!value) {
              setInput('');
            }
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
        ? renderFloatingPanel(
            <>
              {loading ? (
                <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Searching…
                </div>
              ) : null}
              {filteredItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  data-suggestion-highlighted={idx === highlightedIdx ? 'true' : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    ignoreBlurRef.current = true;
                    handleSelect(item.id);
                  }}
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
            </>,
            true
          )
        : null}

      {isOpen && !hasEnoughInput && minCharactersToSearch > 0 && showMinCharactersHint
        ? renderFloatingPanel(
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              Type at least {minCharactersToSearch} character{minCharactersToSearch === 1 ? '' : 's'} to search
            </p>
          )
        : null}

      {isOpen && loading && filteredItems.length === 0
        ? renderFloatingPanel(
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Searching…</p>
          )
        : null}

      {isOpen && hasEnoughInput && !loading && input && filteredItems.length === 0
        ? renderFloatingPanel(
            <div>
              <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                No matches found for &quot;{input}&quot;
              </p>
              {emptyAction ? (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    ignoreBlurRef.current = true;
                    emptyAction.onAction(input.trim());
                    setIsOpen(false);
                  }}
                  className="w-full border-t border-slate-200 px-3 py-2 text-left text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-emerald-600/20"
                >
                  {typeof emptyAction.label === 'function'
                    ? emptyAction.label(input.trim())
                    : (emptyAction.label ?? `Create "${input.trim()}"`)}
                </button>
              ) : null}
            </div>
          )
        : null}
    </div>
  );
}
