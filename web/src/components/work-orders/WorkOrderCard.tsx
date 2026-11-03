import { WORK_ORDER_STATUS, isValidWorkOrderTransition } from '@unithor/shared';
import { ChevronDown, Clock3, Download, Eye, ListChecks, PackageCheck, PackageSearch, UserCog, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

import WorkOrderCardPopover from './WorkOrderCardPopover';
import { WORK_ORDER_STATUS_LABELS } from './WorkOrderStatusBadge';
import { formatClp, formatDate } from '../../lib/formatters';
import { getElapsedInfo, getWorkOrderProgress, PROGRESS_TIER_STYLES } from '../../lib/work-order-progress';

import type { WorkOrder } from '../../types/entities';
import type { WorkOrderStatus } from '@unithor/shared';

export type WorkOrderCardExpansion = { id: number; panel: 'information' | 'status'; mode?: 'hover' | 'manual' } | null;

interface Props {
  workOrder: WorkOrder;
  now: number;
  canManage: boolean;
  showFinancials: boolean;
  statusPending: boolean;
  expansion: WorkOrderCardExpansion;
  onExpand: (value: WorkOrderCardExpansion) => void;
  onChangeStatus: (workOrder: WorkOrder, status: WorkOrderStatus) => void;
  onDeliver: () => void;
  onOpenDetail: () => void;
  onPreviewPdf: () => void;
  onOpenExecution?: () => void;
}

export default function WorkOrderCard({
  workOrder, now, canManage, showFinancials, statusPending, expansion, onExpand,
  onChangeStatus, onDeliver, onOpenDetail, onPreviewPdf, onOpenExecution,
}: Props) {
  const anchorRef = useRef<HTMLElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);
  const hoverSuppressed = useRef(false);
  const expansionRef = useRef(expansion);
  expansionRef.current = expansion;
  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => clearTimers, [clearTimers]);
  const close = useCallback(() => {
    clearTimers();
    hoverSuppressed.current = true;
    onExpand(null);
  }, [clearTimers, onExpand]);
  const activePanel = expansion?.id === workOrder.id ? expansion.panel : null;
  const toggle = (panel: 'information' | 'status') => {
    clearTimers();
    const hoverOpen = activePanel === panel && expansion?.mode === 'hover';
    onExpand(activePanel === panel && !hoverOpen ? null : { id: workOrder.id, panel, mode: 'manual' });
  };
  const keepHoverOpen = () => {
    pointerInside.current = true;
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const leaveHover = () => {
    pointerInside.current = false;
    hoverSuppressed.current = false;
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      const current = expansionRef.current;
      if (pointerInside.current || current?.id !== workOrder.id || current.mode !== 'hover') return;
      const panel = document.getElementById(`work-order-card-information-${workOrder.id}`);
      if (panel?.contains(document.activeElement) || anchorRef.current?.contains(document.activeElement)) return;
      onExpand(null);
    }, 180);
  };
  const progress = getWorkOrderProgress(workOrder);
  const tier = PROGRESS_TIER_STYLES[progress.tier];
  const elapsed = getElapsedInfo(workOrder, now);
  const quotation = workOrder.quotation;
  const terminal = workOrder.estado === 'entregada' || workOrder.estado === 'cancelada';
  const transitions = WORK_ORDER_STATUS.filter((status) => isValidWorkOrderTransition(workOrder.estado, status));
  const total = workOrder.items?.reduce((sum, item) => sum + Number(item.subtotal), 0) ?? null;
  const elapsedText = elapsed.text.replace('En taller ', '').replace('Duración total: ', '');
  const allTasksDone = Boolean(workOrder.items?.length && workOrder.items.every((item) => ['completado', 'omitido'].includes(item.estadoOperativo)));
  const informationId = `work-order-card-information-${workOrder.id}`;
  const statusId = `work-order-card-status-${workOrder.id}`;

  return (
    <article ref={anchorRef} className="workshop-card" data-state={workOrder.estado} data-overdue={!terminal && elapsed.overdue} data-expanded={Boolean(activePanel)} data-panel={activePanel ?? undefined} aria-label={`Orden ${workOrder.codigo}`}
      onPointerEnter={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        keepHoverOpen();
        if (hoverSuppressed.current || document.querySelector('[aria-modal="true"]') || activePanel === 'status') return;
        if (expansionRef.current && expansionRef.current.mode !== 'hover') return;
        if (openTimer.current) clearTimeout(openTimer.current);
        openTimer.current = setTimeout(() => onExpand({ id: workOrder.id, panel: 'information', mode: 'hover' }), 70);
      }}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        const panel = document.getElementById(`work-order-card-information-${workOrder.id}`);
        if (event.relatedTarget instanceof Node && panel?.contains(event.relatedTarget)) return;
        leaveHover();
      }}
    >
      <div className="workshop-card-band">
        <button type="button" onClick={onOpenDetail} aria-label={`Ver detalle de ${workOrder.codigo}`}>{workOrder.codigo}</button>
        <span>{WORK_ORDER_STATUS_LABELS[workOrder.estado]}</span>
      </div>
      <button type="button" className="workshop-card-summary" aria-label={`Ver información de ${workOrder.codigo}`} aria-expanded={activePanel === 'information'} aria-controls={informationId} onClick={() => toggle('information')}>
        <span className="workshop-card-vehicle">
          <span className="workshop-card-plate">{workOrder.vehicle?.patente ?? 'SIN PATENTE'}</span>
          <span>{[workOrder.vehicle?.marca, workOrder.vehicle?.modelo].filter(Boolean).join(' ') || 'Vehículo sin datos'}</span>
        </span>
        <span className="workshop-card-age" title={elapsed.text}>
          {workOrder.estado === 'esperando_repuesto' && <PackageSearch className="workshop-parts-wait" aria-hidden="true" />}
          <span>{elapsed.running ? 'En taller' : 'Duración'}</span><strong>{elapsedText}</strong><span>Ingreso {formatDate(workOrder.fechaIngreso)}</span>
        </span>
        <span className="workshop-card-progress">
          <span>Tareas {progress.completed}/{progress.total}</span>
          <span className="workshop-mini-track" role="progressbar" aria-label={`Avance de ${workOrder.codigo}`} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
            <span className={tier.bar} style={{ width: `${progress.percent}%` }} />
          </span>
          <strong aria-label="Avance">{progress.percent}%</strong>
        </span>
        <span className="workshop-card-bottom">
          <span title={workOrder.client?.nombre ?? undefined}>{workOrder.client?.nombre ?? 'Sin cliente'}</span>
          <span className="workshop-card-expand"><span>{activePanel === 'information' ? 'Ocultar' : 'Información'}</span><ChevronDown aria-hidden="true" /></span>
        </span>
      </button>
      <div className="workshop-card-flags">
        <span>{tier.label}</span>
        {elapsed.overdue && <span className="workshop-overdue-label">Entrega vencida</span>}
        {workOrder.coberturaGarantia && <span>Garantía</span>}
        {workOrder.estado === 'en_progreso' && allTasksDone && <span className="workshop-ready-label">Lista para finalizar</span>}
      </div>
      <footer className="workshop-card-actions">
        {onOpenExecution && <button type="button" className="workshop-manage" onClick={() => { close(); onOpenExecution(); }}><ListChecks aria-hidden="true" /><span>Gestionar trabajo</span></button>}
        <button type="button" aria-label="Ver detalle" title="Ver detalle" className={!onOpenExecution ? 'workshop-manage' : ''} onClick={() => { close(); onOpenDetail(); }}><Eye aria-hidden="true" />{!onOpenExecution && <span>Ver detalle</span>}</button>
        {showFinancials && <button type="button" aria-label={`Previsualizar PDF de ${workOrder.codigo}`} title="Vista previa PDF" onClick={() => { close(); onPreviewPdf(); }}><Download aria-hidden="true" /></button>}
        {canManage && !terminal && transitions.length > 0 && <button type="button" aria-label={`Cambiar estado de ${workOrder.codigo}`} aria-expanded={activePanel === 'status'} aria-haspopup="menu" aria-controls={statusId} title="Cambiar estado" disabled={statusPending} onClick={() => toggle('status')}><ChevronDown aria-hidden="true" /></button>}
      </footer>
      {activePanel === 'information' && (
        <WorkOrderCardPopover anchorRef={anchorRef} id={informationId} label={`Información de ${workOrder.codigo}`} className={`workshop-card-information workshop-state-${workOrder.estado} ${!terminal && elapsed.overdue ? 'workshop-information-overdue' : ''}`} onPointerEnter={keepHoverOpen} onPointerLeave={leaveHover} onBlurCapture={leaveHover} onClose={close}>
          <div className="workshop-popover-heading"><strong>Información de la orden</strong><button type="button" onClick={close} aria-label={`Cerrar información de ${workOrder.codigo}`}><X aria-hidden="true" /></button></div>
          <dl className="workshop-card-facts">
            <div><dt><UserCog aria-hidden="true" />Mecánico</dt><dd>{workOrder.assignedMechanic?.nombre ?? 'Sin mecánico'}</dd></div>
            <div><dt>Origen</dt><dd>{quotation?.codigo ?? 'OT directa'}</dd></div>
            <div><dt><Clock3 aria-hidden="true" />Entrega prometida</dt><dd>{workOrder.fechaEntrega ? formatDate(workOrder.fechaEntrega) : 'Sin fecha prometida'}</dd></div>
            <div><dt>Avance por tareas</dt><dd>{tier.label}{progress.omitted > 0 ? ` · ${progress.omitted} omitida(s)` : ''}</dd></div>
          </dl>
          {showFinancials && <div className="workshop-card-financials">
            <div><span>Total est.</span><strong>{total === null ? '—' : formatClp(total)}</strong></div>
            <div><span>Pagado</span><strong>{quotation ? formatClp(quotation.pagado) : '—'}</strong></div>
            <div className="workshop-card-balance"><span>Saldo pendiente</span><strong>{quotation ? formatClp(Math.max(0, quotation.saldoPendiente)) : 'Sin cotización vinculada'}</strong></div>
          </div>}
        </WorkOrderCardPopover>
      )}
      {activePanel === 'status' && (
        <WorkOrderCardPopover anchorRef={anchorRef} id={statusId} role="menu" label={`Estados permitidos para ${workOrder.codigo}`} onClose={close}>
          {transitions.map((status) => <button key={status} role="menuitem" type="button" className="workshop-state-option" disabled={statusPending} onClick={() => { close(); if (status === 'entregada') onDeliver(); else onChangeStatus(workOrder, status); }}>
            {status === 'entregada' && <PackageCheck aria-hidden="true" />}{WORK_ORDER_STATUS_LABELS[status]}
          </button>)}
        </WorkOrderCardPopover>
      )}
    </article>
  );
}
