'use client';

import { useState, useRef, useEffect } from 'react';
import { searchItems } from '@/lib/utils/fuzzyMatch';

interface SearchSelectProps<T extends { id: string; label: string; searchText?: string }> {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  renderItem?: (item: T, isHighlighted: boolean) => React.ReactNode;
}

export default function SearchSelect<T extends { id: string; label: string; searchText?: string }>(
  props: SearchSelectProps<T>
) {
  const {
    items,
    value,
    onChange,
    onInputChange,
    placeholder = 'Search...',
    label,
    required,
    disabled,
    renderItem,
  } = props;

  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = searchItems(items, input, 0.2);
  const selectedItem = items.find((item) => item.id === value);

  // Update input when value changes externally
  useEffect(() => {
    if (selectedItem && !isOpen) {
      setInput(selectedItem.label);
    } else if (!value && !isOpen) {
      // Clear input when value is cleared
      setInput('');
    }
  }, [value, selectedItem, isOpen]);

  // Reset input when opening
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
          {label}
          {required && ' *'}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          autoComplete="off"
        />

        {input && (
          <button
            type="button"
            onClick={() => {
              setInput('');
              onChange('');
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && filteredItems.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {filteredItems.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              onMouseEnter={() => setHighlightedIdx(idx)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                idx === highlightedIdx
                  ? 'bg-emerald-600/20 text-emerald-400'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              {renderItem ? (
                renderItem(item, idx === highlightedIdx)
              ) : (
                <div>
                  <div className="font-medium">{item.label}</div>
                  {item.searchText && (
                    <div className="text-xs text-slate-400">{item.searchText}</div>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && input && filteredItems.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-lg z-50 p-3">
          <p className="text-xs text-slate-400">No matches found for "{input}"</p>
        </div>
      )}
    </div>
  );
}
