import { Check, ChevronDown, Clock, Edit2, Lock, MessageSquare, Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useReviewWorkOrderDpQualityMutation, useUpdateWorkOrderDpStageMutation } from '../../hooks/useWorkOrders';
import { getApiErrorMessage } from '../../lib/api-error';
import { formatClp, formatDateTime } from '../../lib/formatters';
import { hasUserPermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError, notifySuccess } from '../../stores/toast.store';

import type { WorkOrderDpStage, WorkOrderWorksheetItem } from '../../types/entities';

interface Props {
  compact?: boolean;
  visibleItemIds?: readonly number[];
  workOrderId: number;
  items: WorkOrderWorksheetItem[];
  mechanics: Array<{ id: number; nombre: string }>;
  canManage: boolean;
  closed: boolean;
  onSuggestPrice?: (itemId: number) => void;
  onState?: (id: number, dirty: boolean, pending: boolean) => void;
}

export default function WorkOrderDpSection({
  workOrderId,
  items,
  mechanics,
  canManage,
  closed,
  onSuggestPrice,
  onState,
  compact = false,
  visibleItemIds,
}: Props) {
  const user = useAuthStore((state) => state.user);
  const canUpdate = Boolean(user && hasUserPermission(user, 'taller', 'update'));
  const canSupervise = Boolean(canManage && canUpdate && user && ['jefe', 'admin', 'desarrollador'].includes(user.role));
  const canSeePrice = !compact || Boolean(user && ['jefe', 'admin', 'desarrollador'].includes(user.role));
  const canOperate = (stage: WorkOrderDpStage) => !closed && canUpdate &&
    (canSupervise || (user?.role === 'mecanico' && stage.assignedUserId === user.id));
  const updateStageMutation = useUpdateWorkOrderDpStageMutation();
  const ccfMutation = useReviewWorkOrderDpQualityMutation();

  const [activeNoteModal, setActiveNoteModal] = useState<{
    title: string;
    note: string | null;
    author?: string | null;
    date?: string | null;
    isEditing?: boolean;
    stageId?: number;
    itemId?: number;
    reviewStatus?: 'rechazado';
  } | null>(null);

  const [noteDraft, setNoteDraft] = useState('');
  const pending = updateStageMutation.isPending || ccfMutation.isPending;
  const notePanel = useModalOverlay({ isOpen: Boolean(activeNoteModal), isPending: pending, onClose: () => setActiveNoteModal(null) });
  useEffect(() => {
    onState?.(-1, Boolean(activeNoteModal?.isEditing), pending);
  }, [activeNoteModal?.isEditing, pending, onState]);
  useEffect(() => () => onState?.(-1, false, false), [onState]);

  if (items.length === 0) return null;

  const handleStageAssigneeChange = (stageId: number, assignedUserId: number | null) => {
    if (!canSupervise || closed || pending) return;
    updateStageMutation.mutate(
      {
        workOrderId,
        stageId,
        data: { assignedUserId },
      },
      {
        onSuccess: () => notifySuccess('Mecánico asignado a la etapa'),
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo asignar el mecánico')),
      },
    );
  };

  const handleStageStatusChange = (
    stage: WorkOrderDpStage,
    nextStatus: 'pendiente' | 'en_proceso' | 'completado',
  ) => {
    if (!canOperate(stage) || pending || (nextStatus === 'pendiente' && !canSupervise)) return;
    if (nextStatus === 'completado') {
      setActiveNoteModal({
        title: `Completar ${stage.stageLabel || stage.stageName}`,
        note: stage.note || '',
        isEditing: true,
        stageId: stage.id,
      });
      setNoteDraft(stage.note || '');
      return;
    }

    updateStageMutation.mutate(
      {
        workOrderId,
        stageId: stage.id,
        data: { status: nextStatus },
      },
      {
        onSuccess: () => notifySuccess(`Etapa cambiada a ${nextStatus}`),
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo actualizar la etapa')),
      },
    );
  };

  const handleSaveStageCompletion = () => {
    if (!activeNoteModal?.stageId) return;
    const stage = items.flatMap((item) => item.dpStages ?? []).find((entry) => entry.id === activeNoteModal.stageId);
    if (!stage || !canOperate(stage) || pending || noteDraft.trim().length > 2000) return;
    updateStageMutation.mutate(
      {
        workOrderId,
        stageId: activeNoteModal.stageId,
        data: {
          status: 'completado',
          note: noteDraft.trim() || null,
        },
      },
      {
        onSuccess: () => {
          notifySuccess('Etapa completada exitosamente');
          setActiveNoteModal(null);
          setNoteDraft('');
        },
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo completar la etapa')),
      },
    );
  };

  const handleToggleCcf = (item: WorkOrderWorksheetItem) => {
    if (!canSupervise || closed || pending || item.dpStages?.length !== 5 || !item.dpStages.every((stage) => stage.status === 'completado')) return;
    const nextStatus = item.ccfStatus === 'aprobado' ? 'pendiente' : 'aprobado';
    ccfMutation.mutate(
      {
        workOrderId,
        itemId: item.id,
        data: {
          status: nextStatus,
          note: item.ccfNotes ?? item.ccfNote ?? null,
        },
      },
      {
        onSuccess: () => notifySuccess(`CCF ${nextStatus === 'aprobado' ? 'aprobado' : 'marcado pendiente'}`),
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo actualizar el CCF')),
      },
    );
  };

  const handleSaveCcfNote = () => {
    if (!activeNoteModal?.itemId || !canSupervise || closed || pending || noteDraft.trim().length > 2000) return;
    ccfMutation.mutate(
      {
        workOrderId,
        itemId: activeNoteModal.itemId,
        data: {
          ...(activeNoteModal.reviewStatus ? { status: activeNoteModal.reviewStatus } : {}),
          note: noteDraft.trim() || null,
        },
      },
      {
        onSuccess: () => {
          notifySuccess(activeNoteModal.reviewStatus ? 'CCF rechazado; requiere corrección' : 'Nota de CCF guardada');
          setActiveNoteModal(null);
          setNoteDraft('');
        },
        onError: (err) => notifyError(getApiErrorMessage(err, 'No se pudo guardar la nota')),
      },
    );
  };

  return (
    <section aria-label="D&P · Desabolladura y pintura" className={`${compact ? 'work-order-division work-order-division--dp ' : ''}rounded-2xl border border-sky-200 bg-[#edf4f9] p-4 sm:p-5 shadow-xs mb-5`}>
      {/* Header D&P */}
      <div className={`${compact ? 'work-order-division-heading ' : ''}flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/80 pb-3 mb-4`}>
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-[#1d396a] px-3 py-1 text-sm font-black tracking-wider text-white shadow-xs">
            D&P:
          </span>
          <h3 className="text-xs font-semibold text-slate-700">
            Desabolladura y Pintura
          </h3>
        </div>
        {compact && <span className="work-order-division-count">{items.filter((item) => visibleItemIds === undefined || visibleItemIds.includes(item.id)).length} trabajos · 5 etapas por pieza</span>}
      </div>

      {/* List of D&P items */}
      <div className="space-y-3.5">
        {items.map((item) => {
          const stages = [...(item.dpStages ?? [])].sort(
            (a, b) => (a.stageIndex ?? a.stageOrder ?? 0) - (b.stageIndex ?? b.stageOrder ?? 0),
          );

          return (
            <div
              key={item.id}
              hidden={visibleItemIds !== undefined && !visibleItemIds.includes(item.id)}
              className={`${compact ? 'division-job ' : ''}rounded-xl border border-sky-300/60 bg-white/95 p-3.5 shadow-xs`}
            >
              <div className={`${compact ? 'division-job-main division-dp-main ' : ''}grid gap-3 lg:grid-cols-[14rem_1fr_auto] lg:items-center`}>
                {/* Piece name */}
                <div className={`${compact ? 'division-job-name ' : ''}rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-slate-800 text-sm`}>
                  {item.descripcion}
                </div>

                {/* 5 Stages Grid */}
                <div className={`${compact ? 'division-dp-stages ' : ''}grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5`}>
                  {stages.map((stage, idx) => {
                    const isLocked = stage.stageIndex > 1 && (
                      stages.slice(0, idx).length !== stage.stageIndex - 1 ||
                      stages.slice(0, idx).some((previous) => previous.status !== 'completado')
                    );
                    const isDone = stage.status === 'completado';
                    const isInProgress = stage.status === 'en_proceso';

                    return (
                      <div
                        key={stage.id}
                        className={`${compact ? 'division-dp-stage ' : ''}flex flex-col justify-between rounded-lg border p-2 transition-all ${
                          isDone
                            ? 'border-emerald-300 bg-emerald-50/80 text-emerald-950'
                            : isInProgress
                              ? 'border-blue-300 bg-blue-50/90 text-blue-950 ring-2 ring-blue-400/30'
                              : isLocked
                                ? 'border-slate-200 bg-slate-100/80 text-slate-400 opacity-60'
                                : 'border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                          <span className="truncate" title={stage.stageLabel || stage.stageName}>
                            {stage.stageLabel || stage.stageName}
                          </span>
                          {isDone ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          ) : isLocked ? (
                            <Lock className="h-3 w-3 text-slate-400 shrink-0" />
                          ) : isInProgress ? (
                            <Clock className="h-3 w-3 text-blue-600 animate-spin shrink-0" />
                          ) : null}
                        </div>

                        {/* Assignee selector with dropdown arrow */}
                        <div className="relative mt-1">
                          <select
                            aria-label={`Mecánico de ${stage.stageLabel}${compact ? ` · ${item.descripcion}` : ''}`}
                            disabled={!canSupervise || closed || pending}
                            value={stage.assignedUserId ?? ''}
                            onChange={(e) =>
                              handleStageAssigneeChange(
                                stage.id,
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                            className="h-7 w-full appearance-none rounded-md border border-slate-200 bg-white/90 pl-1.5 pr-5 text-[10px] font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:opacity-60"
                          >
                            <option value="">Sin asignar ▼</option>
                            {stage.assignedUserId && !mechanics.some((worker) => worker.id === stage.assignedUserId) && (
                              <option value={stage.assignedUserId}>{stage.assignedUserName ?? stage.assignedUser?.nombre ?? `Técnico #${stage.assignedUserId}`}</option>
                            )}
                            {mechanics.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nombre}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-1.5 top-2 h-3 w-3 text-slate-400" />
                        </div>

                        {/* Action status button & Note badge */}
                        <div className="mt-2 flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
                          {canOperate(stage) && (canSupervise || !isDone) && (
                            <button
                              type="button"
                              disabled={isLocked || pending || !stage.assignedUserId}
                              onClick={() =>
                                handleStageStatusChange(
                                  stage,
                                  isDone ? 'pendiente' : isInProgress ? 'completado' : 'en_proceso',
                                )
                              }
                              className={`rounded px-1.5 py-0.5 text-[9px] font-bold transition ${
                                isDone
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : isInProgress
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              } disabled:opacity-50`}
                            >
                              {isDone ? 'Listo ✓' : isInProgress ? 'Terminar' : 'Iniciar'}
                            </button>
                          )}

                          {/* Note button */}
                          {(stage.note || stage.mechanicNote) && (
                            <button
                              type="button"
                              title="Ver nota técnica del mecánico"
                              onClick={() =>
                                setActiveNoteModal({
                                  title: `Nota: ${stage.stageLabel || stage.stageName}`,
                                  note: stage.note ?? stage.mechanicNote ?? null,
                                  author: stage.assignedUserName ?? null,
                                  date: stage.completedAt
                                    ? formatDateTime(String(stage.completedAt))
                                    : null,
                                  isEditing: false,
                                })
                              }
                              className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-900 hover:bg-amber-200"
                            >
                              <MessageSquare className="h-2.5 w-2.5" />
                              Nota
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Price */}
                <div className={`${compact ? 'division-job-price ' : ''}flex items-center justify-between lg:flex-col lg:items-end gap-1.5 pl-2`}>
                  {compact && canSeePrice && item.precioUnitario !== undefined && <small>Precio unitario neto</small>}
                  {canSeePrice && item.precioUnitario !== undefined && <span className="font-extrabold text-sm text-slate-800">
                    {formatClp(item.precioUnitario ?? 0)}
                  </span>}
                  {onSuggestPrice && !closed && canUpdate && (canSupervise || item.dpStages?.some((stage) => stage.assignedUserId === user?.id)) && (
                    <button
                      type="button"
                      aria-label={compact ? `Gestionar precio de ${item.descripcion}` : undefined}
                      onClick={() => onSuggestPrice(item.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900"
                    >
                      <Edit2 className="h-3 w-3" />
                      Precio
                    </button>
                  )}
                </div>
              </div>

              {/* CCF & Jefatura note footer per item */}
              <div className={`${compact ? 'division-dp-quality ' : ''}mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-2.5`}>
                {/* CCF Toggle */}
                <button
                  type="button"
                  aria-label={compact ? `CCF de ${item.descripcion}: ${item.ccfStatus === 'aprobado' ? 'Aprobado' : item.ccfStatus === 'rechazado' ? 'Rechazado' : 'Pendiente'}` : undefined}
                  disabled={!canSupervise || closed || pending || stages.length !== 5 || stages.some((stage) => stage.status !== 'completado')}
                  onClick={() => handleToggleCcf(item)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-xs ${
                    item.ccfStatus === 'aprobado'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  } disabled:opacity-60`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  CCF: {item.ccfStatus === 'aprobado' ? '✓ Aprobado' : item.ccfStatus === 'rechazado' ? 'Rechazado' : 'Pendiente'}
                </button>
                {canSupervise && !closed && stages.length === 5 && stages.every((stage) => stage.status === 'completado') && (
                  <button type="button" disabled={pending} className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700"
                    onClick={() => {
                      setActiveNoteModal({ title: `Rechazar CCF: ${item.descripcion}`, note: null, itemId: item.id, reviewStatus: 'rechazado', isEditing: true });
                      setNoteDraft('');
                    }}>Rechazar CCF</button>
                )}

                {/* Jefatura Note */}
                {canSupervise && <button
                  type="button"
                  aria-label={compact ? `Nota de jefatura de ${item.descripcion}` : undefined}
                  disabled={closed || pending}
                  onClick={() => {
                    setActiveNoteModal({
                      title: `Nota Jefatura CCF: ${item.descripcion}`,
                      note: item.ccfNote || item.ccfNotes || '',
                      isEditing: true,
                      itemId: item.id,
                    });
                    setNoteDraft(item.ccfNote || item.ccfNotes || '');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nota: +
                </button>}
                {(item.ccfNotes ?? item.ccfNote) && <p className="w-full whitespace-pre-wrap text-xs text-slate-700">Nota de jefatura: {item.ccfNotes ?? item.ccfNote}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Note view/edit modal */}
      {activeNoteModal && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div ref={notePanel} role="dialog" aria-modal="true" aria-label={activeNoteModal.title} tabIndex={-1} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="font-bold text-base text-slate-900 mb-2">
              {activeNoteModal.title}
            </h3>

            {activeNoteModal.isEditing ? (
              <div className="space-y-3">
                <textarea
                  className="w-full h-28 rounded-xl border border-slate-200 p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none"
                  placeholder="Escriba aquí la nota u observación..."
                  value={noteDraft}
                  aria-label="Nota de la etapa o revisión"
                  maxLength={2000}
                  disabled={pending}
                  onChange={(e) => setNoteDraft(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setActiveNoteModal(null)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={pending || noteDraft.trim().length > 2000 || (activeNoteModal.reviewStatus === 'rechazado' && !noteDraft.trim())}
                    onClick={
                      activeNoteModal.stageId
                        ? handleSaveStageCompletion
                        : handleSaveCcfNote
                    }
                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                  {activeNoteModal.note || 'Sin nota registrada.'}
                </div>
                {activeNoteModal.author && (
                  <p className="text-xs text-slate-500">
                    Registrado por: <strong>{activeNoteModal.author}</strong>
                    {activeNoteModal.date ? ` · ${activeNoteModal.date}` : ''}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveNoteModal(null)}
                    className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-900"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>, document.body
      )}
    </section>
  );
}
