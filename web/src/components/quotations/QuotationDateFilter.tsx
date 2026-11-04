import { CalendarDays, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

interface Props {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}

export default function QuotationDateFilter({ from, to, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [error, setError] = useState('');
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = (): void => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div className="commercial-date-picker" ref={anchor}>
    <button ref={trigger} type="button" aria-label="Fecha de emisión" aria-expanded={open} aria-controls={open ? id : undefined} data-active={Boolean(from || to)} onClick={() => {
      if (open) { close(); return; }
      setDraftFrom(from); setDraftTo(to); setError(''); setOpen(true);
    }}><CalendarDays aria-hidden="true" /><span>Fecha</span><ChevronDown aria-hidden="true" /></button>
    {open && <form id={id} aria-label="Filtrar por fecha de emisión" noValidate onSubmit={(event) => {
      event.preventDefault();
      if (draftFrom && draftTo && draftFrom > draftTo) {
        setError('La fecha final debe ser igual o posterior a la inicial.');
        return;
      }
      onApply(draftFrom, draftTo); close();
    }}>
      <strong>Fecha de emisión</strong>
      <label>Desde<input type="date" aria-label="Fecha desde" value={draftFrom} onChange={(event) => { setDraftFrom(event.target.value); setError(''); }} /></label>
      <label>Hasta<input type="date" aria-label="Fecha hasta" value={draftTo} onChange={(event) => { setDraftTo(event.target.value); setError(''); }} /></label>
      {error && <p role="alert">{error}</p>}
      <div><button type="button" onClick={() => { onApply('', ''); close(); }}>Todas las fechas</button><button type="submit">Aplicar</button></div>
    </form>}
  </div>;
}
