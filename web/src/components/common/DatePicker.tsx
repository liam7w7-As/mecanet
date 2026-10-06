import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import { createPortal } from 'react-dom';

import 'react-day-picker/style.css';
import './DatePicker.css';

import type { CSSProperties } from 'react';

interface DatePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const toDateValue = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const CalendarChevron = ({ orientation }: { orientation?: string }) => {
  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
};

const DatePicker = ({ label, value, onChange }: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ position: 'fixed', width: 304, visibility: 'hidden' });
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const formatted = selected?.toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const close = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const selectDate = (date: Date | undefined): void => {
    onChange(date ? toDateValue(date) : '');
    close();
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!rect || !panel) return;
      const width = Math.min(304, window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const upward = below < panel.offsetHeight && above > below;
      setPosition({
        position: 'fixed',
        width,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        maxHeight: Math.max(100, upward ? above - 8 : below - 8),
        ...(upward ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      });
    };
    updatePosition();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    const filterRow = anchorRef.current?.parentElement?.parentElement;
    if (filterRow) observer?.observe(filterRow);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const isOutside = (target: EventTarget | null): boolean => target instanceof Node
      && !anchorRef.current?.contains(target) && !panelRef.current?.contains(target);
    const dismissOutside = (event: PointerEvent | FocusEvent): void => {
      if (isOutside(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [open]);

  return (
    <div ref={anchorRef} className="inline-flex h-9 min-w-0 overflow-hidden rounded-lg border border-brand-line bg-white shadow-sm focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/15">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-full min-w-40 items-center justify-between gap-2 px-3 text-sm font-medium outline-none transition-colors hover:bg-brand-pale ${value ? 'bg-brand-pale text-brand-primaryInk' : 'text-brand-muted'}`}
      >
        <span>{formatted ?? 'Elegir fecha'}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-brand-primaryInk" aria-hidden="true" />
      </button>
      {value && (
        <button
          type="button"
          aria-label={`Limpiar ${label.toLowerCase()}`}
          title="Limpiar fecha"
          className="flex h-full w-8 shrink-0 items-center justify-center border-l border-brand-line text-brand-muted hover:bg-brand-pale focus:outline-none focus-visible:bg-brand-pale"
          onClick={() => selectDate(undefined)}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {open && createPortal(
        <div ref={panelRef} id={dialogId} role="dialog" aria-label={`Calendario: ${label.toLowerCase()}`} style={position} className="z-[80] overflow-y-auto overscroll-contain rounded-lg border border-brand-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-brand-line bg-brand-pale/50 px-3 py-1">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand-primaryInk">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {label}
            </span>
            <button type="button" onClick={close} aria-label="Cerrar calendario" title="Cerrar calendario" className="flex h-7 w-7 items-center justify-center rounded-md text-brand-muted hover:bg-brand-line">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <DayPicker
            className="unithor-calendar"
            mode="single"
            required
            selected={selected}
            defaultMonth={selected}
            onSelect={selectDate}
            locale={es}
            weekStartsOn={1}
            showOutsideDays
            fixedWeeks
            autoFocus
            components={{ Chevron: CalendarChevron }}
          />
          <div className="flex items-center justify-between border-t border-brand-line px-3 py-1">
            <button type="button" onClick={() => selectDate(new Date())} className="rounded-md px-2 py-1.5 text-xs font-semibold text-brand-primaryInk hover:bg-brand-pale">Hoy</button>
            <button type="button" onClick={() => selectDate(undefined)} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-brand-muted hover:bg-brand-pale">
              <X className="h-3 w-3" aria-hidden="true" />Sin filtro
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default DatePicker;
