import { DEFAULT_WORKSHOP_TIMEZONE } from '@unithor/shared';
import { CalendarDays, CarFront, Clock3, History, Plus } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';

import BrandLogo from '../../components/common/BrandLogo';
import WorkshopDailyEntryModal from '../../components/work-orders/WorkshopDailyEntryModal';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import {
  dailyActivityLabel,
  dailyLocalDate,
  useWorkshopDailyLog,
} from '../../hooks/useWorkshopDailyLog';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatWorkshopMinutes } from '../../lib/workshop-time-format';

import type { DailyOrder } from '../../hooks/useWorkshopDailyLog';

import './workshop-daily-journal.css';

const WorkshopTimePanel = lazy(() => import('../../components/work-orders/WorkshopTimePanel'));
const cleanState = { dirty: false, pending: false };

function ContextConfirmation({
  onCancel,
  onContinue,
}: {
  onCancel: () => void;
  onContinue: () => void;
}) {
  const overlay = useModalOverlay({ isOpen: true, onClose: onCancel });
  return createPortal(
    <div className="daily-context-overlay">
      <section
        ref={overlay}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="daily-context-title"
        tabIndex={-1}
      >
        <h2 id="daily-context-title">¿Cambiar de contexto?</h2>
        <p>
          Hay una captura sin terminar. El borrador del registro diario se conserva en este
          navegador para este usuario. Los ajustes abiertos conservan sus propios filtros y cambios.
        </p>
        <button type="button" onClick={onCancel}>
          Seguir editando
        </button>
        <button type="button" onClick={onContinue}>
          Conservar borrador y cambiar
        </button>
      </section>
    </div>,
    document.body,
  );
}

export default function WorkshopJournalPage() {
  const [params, setParams] = useSearchParams();
  const dateParam = params.get('fecha');
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : dailyLocalDate();
  const workerParam = Number(params.get('trabajador'));
  const selectedWorker = Number.isInteger(workerParam) && workerParam > 0 ? workerParam : undefined;
  const log = useWorkshopDailyLog(date, selectedWorker);
  const timezone = log.journal.data?.timezone ?? DEFAULT_WORKSHOP_TIMEZONE;
  const [active, setActive] = useState<{
    order: DailyOrder;
    date: string;
    workerId: number;
    workerName: string;
  } | null>(null);
  const [modalState, setModalState] = useState(cleanState);
  const [panelState, setPanelState] = useState(cleanState);
  const [advanced, setAdvanced] = useState<{ date: string; visible: boolean } | null>(null);
  const [confirmContext, setConfirmContext] = useState(false);
  const nextContext = useRef<(() => void) | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<'TODAS' | 'DP' | 'ACC' | 'MEC'>('TODAS');

  const filteredOrders = useMemo(() => {
    if (selectedDivision === 'TODAS') return log.orders;
    return log.orders.filter((order) =>
      order.services.some(
        (s) => s.division === selectedDivision || (selectedDivision === 'DP' && s.description.includes(' · ')),
      ),
    );
  }, [log.orders, selectedDivision]);
  const onModalState = useCallback((dirty: boolean, pending: boolean) => {
    setModalState((old) =>
      old.dirty === dirty && old.pending === pending ? old : { dirty, pending },
    );
  }, []);
  const onPanelState = useCallback((dirty: boolean, pending: boolean) => {
    setPanelState((old) =>
      old.dirty === dirty && old.pending === pending ? old : { dirty, pending },
    );
  }, []);

  useEffect(() => {
    setActive(null);
    setModalState(cleanState);
    setPanelState(cleanState);
    setAdvanced(null);
    setConfirmContext(false);
    nextContext.current = null;
    setFeedback(null);
  }, [log.user?.id]);

  useEffect(() => {
    if (!modalState.dirty && !modalState.pending && !panelState.dirty && !panelState.pending)
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [modalState, panelState]);

  const changeContext = (action: () => void) => {
    if (modalState.pending || panelState.pending) {
      setFeedback('Espera a que termine el guardado antes de cambiar de contexto.');
      return;
    }
    if (modalState.dirty || panelState.dirty) {
      nextContext.current = action;
      setConfirmContext(true);
      return;
    }
    setActive(null);
    action();
  };
  const changeFilter = (name: string, value: string) =>
    changeContext(() => {
      const next = new URLSearchParams(params);
      if (value) next.set(name, value);
      else next.delete(name);
      setParams(next, { replace: true });
      setFeedback(null);
      setAdvanced((old) => (old ? { ...old, visible: false } : null));
    });

  if (!log.allowed)
    return (
      <div className="daily-journal">
        <h1>Registro diario</h1>
        <p role="alert">No tienes permiso para consultar el registro diario de taller.</p>
      </div>
    );

  const workerName =
    log.journal.data?.workers.find((worker) => worker.id === log.workerId)?.nombre ??
    (log.workerId === log.user?.id
      ? (log.user?.nombre ?? 'Mi jornada')
      : `Trabajador #${log.workerId}`);
  const totals = log.journal.data?.totals;
  return (
    <div className="daily-journal workspace-page">
      <header className="daily-journal-heading">
        <div>
          <span className="daily-journal-eyebrow">TALLER / JORNADA</span>
          <h1>Registro diario</h1>
        </div>
        <BrandLogo className="dashboard-heading-logo" />
      </header>
      <section className="daily-journal-toolbar" aria-label="Contexto del registro diario">
        <label>
          <span>
            <CalendarDays aria-hidden="true" />
            Fecha
          </span>
          <input
            type="date"
            aria-label="Fecha del registro diario"
            value={date}
            max={dailyLocalDate(new Date(), timezone)}
            onChange={(event) => {
              if (event.target.value) changeFilter('fecha', event.target.value);
            }}
          />
        </label>
        {log.supervisor ? (
          <label>
            Trabajador
            <select
              aria-label="Trabajador del registro diario"
              value={selectedWorker ?? ''}
              onChange={(event) => changeFilter('trabajador', event.target.value)}
            >
              <option value="">Todos los trabajadores</option>
              {log.journal.data?.workers.map((worker) => (
                <option value={worker.id} key={worker.id}>
                  {worker.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="daily-journal-worker">
            {log.user?.nombre}
            <small>Mi jornada</small>
          </span>
        )}
        <button
          type="button"
          className="daily-journal-history-button"
          aria-expanded={advanced?.visible ?? false}
          onClick={() =>
            setAdvanced((old) =>
              old ? { ...old, visible: !old.visible } : { date, visible: true },
            )
          }
        >
          <History aria-hidden="true" />
          Historial, ajustes y revisión de horas
        </button>
      </section>
      <section className="daily-journal-totals" aria-label="Horas del día">
        <div>
          <Clock3 aria-hidden="true" />
          <span>
            Horas registradas<strong>{formatWorkshopMinutes(totals?.registeredMinutes ?? 0)}</strong>
          </span>
        </div>
        <div>
          <span>
            Pendientes de revisión de horas
            <strong>{formatWorkshopMinutes(totals?.pendingMinutes ?? 0)}</strong>
          </span>
        </div>
      </section>
      {feedback && (
        <p role="status" className="daily-journal-notice">
          {feedback}
        </p>
      )}
      {log.journal.isPending && <p role="status">Cargando jornada…</p>}
      {log.journal.isError && (
        <p role="alert" className="daily-entry-error">
          {getApiErrorMessage(log.journal.error, 'No se pudo cargar la jornada.')}{' '}
          <button
            type="button"
            onClick={() => {
              void log.journal.refetch();
            }}
          >
            Reintentar jornada
          </button>
        </p>
      )}
      {log.eligible.isError && (
        <p role="alert" className="daily-entry-error">
          {getApiErrorMessage(log.eligible.error, 'No se pudieron cargar los servicios asignados.')}{' '}
          <button
            type="button"
            onClick={() => {
              void log.eligible.refetch();
            }}
          >
            Reintentar servicios
          </button>
        </p>
      )}
      <section aria-labelledby="daily-orders-title">
        <div className="daily-journal-section-title">
          <h2 id="daily-orders-title">
            {log.supervisor && !selectedWorker
              ? 'OT con registros del día'
              : log.supervisor
                ? `OT de ${workerName}`
                : 'Mis OT del día'}
          </h2>
          <span>{filteredOrders.length} vehículos / OT</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(
            [
              { key: 'TODAS', label: 'Todas' },
              { key: 'DP', label: 'D&P (Carrocería y Pintura)' },
              { key: 'ACC', label: 'ACC (Repuestos)' },
              { key: 'MEC', label: 'MEC (Mecánica)' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedDivision === tab.key
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-brand-pale text-brand-ink hover:bg-brand-line/50'
              }`}
              onClick={() => setSelectedDivision(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {log.eligible.isFetching && <p role="status">Actualizando trabajos asignados…</p>}
        {!filteredOrders.length && !log.journal.isPending && !log.eligible.isFetching && (
          <div className="daily-journal-empty">
            <CarFront aria-hidden="true" />
            <p>
              {log.supervisor && !selectedWorker
                ? 'Selecciona un trabajador para ver sus trabajos asignados.'
                : 'No hay trabajos asignados ni registros para esta fecha o filtro seleccionado.'}
            </p>
          </div>
        )}
        <div className="daily-journal-orders">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="daily-journal-order"
              aria-label={`Orden ${order.code}`}
            >
              <header>
                <span className="daily-journal-car">
                  <CarFront aria-hidden="true" />
                </span>
                <div>
                  {order.patente && (
                    <strong className="daily-journal-plate">{order.patente}</strong>
                  )}
                  <h3>{order.code}</h3>
                </div>
                <button
                  type="button"
                  aria-label={`Agregar registro a ${order.code}`}
                  disabled={!log.canRegister || log.journal.isError}
                  onClick={() => {
                    if (log.workerId)
                      setActive({ order, date, workerId: log.workerId, workerName });
                  }}
                >
                  <Plus aria-hidden="true" />
                </button>
              </header>
              <p>
                {new Set(order.services.map((service) => service.itemId)).size}{' '}
                {order.services.length === 1 ? 'trabajo' : 'trabajos'}
              </p>
              <ul>
                {order.services.map((service) => (
                  <li key={`${service.itemId}-${service.dpStageId ?? 'service'}-${service.userId}`}>
                    <span>{service.description}</span>
                    <small>
                      {!service.activityStatus &&
                      service.registeredMinutes === 0 &&
                      service.pendingMinutes === 0
                        ? 'Sin registro hoy'
                        : dailyActivityLabel(service.activityStatus, service.teamPending)}
                    </small>
                  </li>
                ))}
              </ul>
              <footer>
                <span>
                  {formatWorkshopMinutes(
                    order.services.reduce((sum, service) => sum + service.registeredMinutes, 0),
                  )}{' '}
                  registradas
                </span>
                <span>
                  {formatWorkshopMinutes(
                    order.services.reduce((sum, service) => sum + service.pendingMinutes, 0),
                  )}{' '}
                  por revisar
                </span>
              </footer>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="daily-records-title">
        <div className="daily-journal-section-title">
          <h2 id="daily-records-title">Registros del día</h2>
          <span>{log.records.length} registros</span>
        </div>
        {!log.records.length && !log.journal.isPending && (
          <p className="daily-journal-empty">Todavía no hay registros para esta fecha.</p>
        )}
        <ol className="daily-journal-records">
          {log.records.map((record) => (
            <li key={record.key}>
              <div>
                <strong>{record.workOrderCode}</strong>
                <h3>{record.description}</h3>
                {log.supervisor && <small>{record.userName}</small>}
                {record.reportedDate ? (
                  <p>
                    Horas declaradas ·{' '}
                    <time dateTime={record.reportedDate}>
                      {record.reportedDate.split('-').reverse().join('-')}
                    </time>
                  </p>
                ) : (
                  <p>
                    {new Date(record.startedAt).toLocaleTimeString('es-CL', {
                      timeZone: timezone,
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}{' '}
                    –{' '}
                    {record.endedAt
                      ? new Date(record.endedAt).toLocaleTimeString('es-CL', {
                          timeZone: timezone,
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })
                      : 'Cronómetro abierto'}
                  </p>
                )}
              </div>
              <div className="daily-journal-record-status">
                <strong>{formatWorkshopMinutes(record.minutes)}</strong>
                <span>
                  {record.rejected
                    ? 'Horas rechazadas'
                    : record.pending
                      ? 'Horas pendientes de revisión'
                      : record.running
                        ? 'Cronómetro en curso'
                        : 'Horas registradas'}
                </span>
                {record.activityStatus && (
                  <small>{dailyActivityLabel(record.activityStatus, record.teamPending)}</small>
                )}
              </div>
              {record.note && <p className="daily-journal-record-note">{record.note}</p>}
            </li>
          ))}
        </ol>
      </section>
      {advanced && (
        <section
          hidden={!advanced.visible}
          className="daily-journal-advanced"
          aria-label="Historial y ajustes de horas"
        >
          <h2>Historial, correcciones y revisión de horas</h2>
          <Suspense fallback={<p role="status">Cargando historial…</p>}>
            <WorkshopTimePanel initialDate={advanced.date} onState={onPanelState} />
          </Suspense>
        </section>
      )}
      {active && log.canRegister && (
        <WorkshopDailyEntryModal
          key={`${log.user?.id}-${active.workerId}-${active.date}-${active.order.id}`}
          {...active}
          order={
            active.date === date && active.workerId === log.workerId
              ? (log.orders.find((order) => order.id === active.order.id) ?? active.order)
              : active.order
          }
          onState={onModalState}
          onClose={() => setActive(null)}
          onComplete={(status) => {
            setActive(null);
            setFeedback(
              status === 'aprobada'
                ? 'Registro guardado: avance aplicado y horas registradas.'
                : 'Registro guardado: avance aplicado y horas pendientes de revisión.',
            );
          }}
        />
      )}
      {confirmContext && (
        <ContextConfirmation
          onCancel={() => {
            nextContext.current = null;
            setConfirmContext(false);
          }}
          onContinue={() => {
            setConfirmContext(false);
            setActive(null);
            const action = nextContext.current;
            nextContext.current = null;
            action?.();
          }}
        />
      )}
    </div>
  );
}
