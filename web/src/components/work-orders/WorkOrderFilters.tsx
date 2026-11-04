import {
  Ban, CalendarDays, CheckCheck, ChevronDown, CirclePlay, LayoutGrid,
  PackageSearch, Plus, Search, Truck, X,
} from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import WorkOrderCardPopover from './WorkOrderCardPopover';
import DatePicker from '../common/DatePicker';

import type { WorkOrderStatus } from '@unithor/shared';

export type WorkOrderStatusFilter = WorkOrderStatus | 'all';
export type WorkOrderDateFilter = 'all' | '3_days' | '15_days' | 'month' | 'date';

const statuses = [
  { value: 'all', label: 'Todas', icon: LayoutGrid },
  { value: 'en_progreso', label: 'Iniciadas', icon: CirclePlay },
  { value: 'esperando_repuesto', label: 'Esperando repuesto', icon: PackageSearch },
  { value: 'finalizada', label: 'Finalizadas', icon: CheckCheck },
  { value: 'entregada', label: 'Entregadas', icon: Truck },
  { value: 'cancelada', label: 'Anuladas', icon: Ban },
] as const;

const periods = [
  { value: 'all', label: 'Todas las fechas' },
  { value: '3_days', label: '3 días' },
  { value: '15_days', label: '15 días' },
  { value: 'month', label: 'Por mes' },
  { value: 'date', label: 'Fecha específica' },
] as const;

interface Props {
  search: string;
  onSearch: (value: string) => void;
  status: WorkOrderStatusFilter;
  onStatus: (value: WorkOrderStatusFilter) => void;
  period: WorkOrderDateFilter;
  onPeriod: (value: WorkOrderDateFilter) => void;
  selectedMonth: string;
  onMonth: (value: string) => void;
  selectedDate: string;
  onDate: (value: string) => void;
  canCreate: boolean;
}

export default function WorkOrderFilters({
  search, onSearch, status, onStatus, period, onPeriod, selectedMonth,
  onMonth, selectedDate, onDate, canCreate,
}: Props) {
  const [periodOpen, setPeriodOpen] = useState(false);
  const [calendarSession, setCalendarSession] = useState(0);
  const periodAnchor = useRef<HTMLDivElement>(null);
  const periodTrigger = useRef<HTMLButtonElement>(null);
  const periodId = useId();
  const closePeriod = useCallback(() => setPeriodOpen(false), []);
  const compactPeriodLabel = { all: 'Fecha', '3_days': '3 días', '15_days': '15 días', month: 'Mes', date: 'Fecha' }[period];

  return (
    <div className="workshop-filters">
      <div className="workshop-toolbar">
        <label className="workshop-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar órdenes de trabajo</span>
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar OT, patente o cliente" />
          {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => onSearch('')}><X aria-hidden="true" /></button>}
        </label>
        <div ref={periodAnchor} className="workshop-period-picker">
          <button
            ref={periodTrigger}
            type="button"
            aria-label="Periodo de ingreso"
            aria-haspopup="menu"
            aria-expanded={periodOpen}
            aria-controls={periodId}
            data-active={period !== 'all'}
            title={periods.find((option) => option.value === period)?.label}
            onClick={() => setPeriodOpen((open) => !open)}
          >
            <CalendarDays aria-hidden="true" />
            <span className="workshop-period-full">{periods.find((option) => option.value === period)?.label}</span>
            <span className="workshop-period-compact" aria-hidden="true">{compactPeriodLabel}</span>
            <ChevronDown aria-hidden="true" />
          </button>
          {periodOpen && (
            <WorkOrderCardPopover anchorRef={periodAnchor} id={periodId} label="Filtrar por fecha de ingreso" role="menu" minWidth={240} className="workshop-period-menu" onClose={closePeriod}>
              {periods.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={period === option.value}
                  onClick={() => {
                    if (option.value === 'date') setCalendarSession((session) => session + 1);
                    onPeriod(option.value);
                    closePeriod();
                    if (option.value !== 'date') periodTrigger.current?.focus();
                  }}
                >{option.label}<span aria-hidden="true">{period === option.value ? '✓' : ''}</span></button>
              ))}
            </WorkOrderCardPopover>
          )}
        </div>
        {canCreate && <Link to="/work-orders/new" className="primary-button workshop-new-order" aria-label="Nueva Orden de Trabajo" title="Nueva Orden de Trabajo"><Plus aria-hidden="true" /><span>Nueva orden</span></Link>}
        <div className="workshop-status-filters" role="tablist" aria-label="Filtrar por estado">
          {statuses.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" role="tab" aria-selected={status === value} aria-label={label} title={label} onClick={() => onStatus(value)}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      {period === 'month' && <label className="workshop-selected-date">Mes de ingreso<input type="month" aria-label="Mes de ingreso" value={selectedMonth} onChange={(event) => onMonth(event.target.value)} /></label>}
      {period === 'date' && <div className="workshop-selected-date"><DatePicker key={calendarSession} label="Fecha específica" value={selectedDate} onChange={(date) => { onDate(date); if (!date) periodTrigger.current?.focus(); }} autoOpen /></div>}
    </div>
  );
}
