import { Check, ChevronDown, X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CSSProperties, InputHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
}

interface SearchableSelectProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  clearLabel: string;
  listLabel: string;
}

const searchable = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const SearchableSelect = ({
  value,
  options,
  onChange,
  clearLabel,
  listLabel,
  disabled,
  onBlur,
  className,
  ...props
}: SearchableSelectProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const visible = options.filter((option) =>
    searchable([option.label, ...(option.keywords ?? [])].join(' ')).includes(searchable(query)),
  );
  const index = Math.min(activeIndex, visible.length - 1);
  const selected = options.find((option) => option.value === value);

  const select = (option: SelectOption): void => {
    onChange(option.value);
    inputRef.current?.focus();
    setOpen(false);
    setQuery('');
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const upward = below < 220 && above > below;
      setPosition({
        position: 'fixed',
        width: rect.width,
        left: rect.left,
        maxHeight: Math.min(240, Math.max(72, (upward ? above : below) - 12)),
        ...(upward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open && index >= 0)
      listRef.current?.children[index]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, index, query]);

  return (
    <div ref={anchorRef} className="relative min-w-0">
      <input
        {...props}
        ref={inputRef}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-autocomplete="list"
        aria-expanded={open && !disabled}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && index >= 0 ? `${listId}-${index}` : undefined}
        className={`${className ?? ''} pr-16`}
        value={open ? query : (selected?.label ?? value)}
        onFocus={(event) => {
          props.onFocus?.(event);
          setQuery('');
          setActiveIndex(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && listRef.current?.contains(event.relatedTarget))
            return;
          const exact =
            query.trim() &&
            visible.find((option) => searchable(option.label) === searchable(query));
          if (exact) onChange(exact.value);
          setOpen(false);
          setQuery('');
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(
              !open
                ? 0
                : Math.max(
                    0,
                    Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                  ),
            );
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (visible[index]) select(visible[index]);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setQuery('');
          }
        }}
      />
      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
        {value && (
          <button
            type="button"
            aria-label={clearLabel}
            title={clearLabel}
            disabled={disabled}
            className="flex h-7 w-7 items-center justify-center rounded text-brand-muted hover:bg-brand-pale"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('');
              setQuery('');
              inputRef.current?.focus();
              setOpen(false);
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <ChevronDown className="pointer-events-none h-4 w-4 text-brand-muted" aria-hidden="true" />
      </div>
      {open &&
        !disabled &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={listLabel}
            style={position}
            className="z-[80] overflow-y-auto overscroll-contain rounded-lg border border-brand-line bg-white py-1 shadow-lg"
          >
            {visible.length === 0 && (
              <li role="presentation" className="px-3 py-3 text-sm text-brand-muted">
                Sin coincidencias
              </li>
            )}
            {visible.map((option, optionIndex) => (
              <li
                key={option.value}
                id={`${listId}-${optionIndex}`}
                role="option"
                aria-selected={option.value === value}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm text-brand-ink ${optionIndex === index ? 'bg-brand-pale' : 'hover:bg-brand-light'}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option)}
              >
                <span className="min-w-0 flex-1 break-words">
                  {option.label}
                  {option.description && (
                    <span className="mt-0.5 block text-xs text-brand-muted">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.value === value && (
                  <Check className="h-4 w-4 shrink-0 text-brand-primaryInk" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
};

export default SearchableSelect;
