import {
  WORK_ORDER_OBSERVATION_FILE_MIME_TYPES,
  WORK_ORDER_OBSERVATION_MAX_FILES,
  WORK_ORDER_OBSERVATION_MAX_FILE_BYTES,
} from '@unithor/shared';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';

import { useFormRecovery } from '../../hooks/useFormRecovery';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import {
  dailyAccess,
  dailyServiceKey,
  useCreateWorkshopDailyEntry,
  useSaveDailyObservations,
} from '../../hooks/useWorkshopDailyLog';
import { useWorkshopTimeEligibleItems } from '../../hooks/useWorkshopTime';
import { getApiErrorMessage } from '../../lib/api-error';
import { useAuthStore } from '../../stores/auth.store';
import FormDialog from '../common/FormDialog';
import FormRecoveryBanner from '../common/FormRecoveryBanner';

import type { DailyOrder } from '../../hooks/useWorkshopDailyLog';
import type { FormEvent } from 'react';

const recoverySchema = z.object({
  clientRequestId: z.string().uuid(),
  itemId: z.string(),
  dpStageId: z.number().int().positive().nullable().default(null),
  // Keep fields/markers from earlier drafts readable without resubmitting a
  // previously saved interval or progress-only action.
  startTime: z.string().default(''),
  hours: z.string(),
  activityStatus: z.enum(['en_proceso', 'completado']),
  note: z.string(),
  extraNotes: z.array(z.string()),
  files: z.array(
    z.object({
      name: z.string(),
      lastModified: z.number(),
      blob: z.custom<Blob>((value) => value instanceof Blob),
    }),
  ),
  savedRequestId: z.number().int().positive().nullable(),
  observationsSaved: z.boolean(),
  hoursStatus: z.enum(['pendiente', 'aprobada', 'rechazada']).nullable().default(null),
  useRecordedHours: z.boolean().default(false),
  progressSaved: z.boolean().default(false),
});
type DailyDraft = z.infer<typeof recoverySchema>;

interface Props {
  order: DailyOrder;
  date: string;
  workerId: number;
  workerName: string;
  onClose: () => void;
  onComplete: (hoursStatus: DailyDraft['hoursStatus']) => void;
  onState?: (dirty: boolean, pending: boolean) => void;
}

function CloseConfirmation({
  onCancel,
  onKeep,
  onDiscard,
  pending,
}: {
  onCancel: () => void;
  onKeep: () => void;
  onDiscard: () => void;
  pending: boolean;
}) {
  const panel = useModalOverlay({ isOpen: true, onClose: onCancel, isPending: pending });
  return createPortal(
    <div className="daily-context-overlay">
      <section
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="daily-close-title"
        tabIndex={-1}
      >
        <h2 id="daily-close-title">Captura sin terminar</h2>
        <button type="button" disabled={pending} onClick={onCancel}>
          Seguir editando
        </button>
        <button type="button" disabled={pending} onClick={onKeep}>
          Conservar borrador y cerrar
        </button>
        <button type="button" disabled={pending} onClick={onDiscard}>
          Descartar captura
        </button>
      </section>
    </div>,
    document.body,
  );
}

function Photo({
  photo,
  onRemove,
  disabled,
}: {
  photo: DailyDraft['files'][number];
  onRemove: () => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return;
    const next = URL.createObjectURL(photo.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo.blob]);
  return (
    <li className="daily-entry-photo">
      {url && <img src={url} alt={`Vista previa de ${photo.name}`} />}
      <span>{photo.name}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Quitar foto ${photo.name}`}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </li>
  );
}

export default function WorkshopDailyEntryModal({
  order,
  date,
  workerId,
  workerName,
  onClose,
  onComplete,
  onState,
}: Props) {
  const user = useAuthStore((state) => state.user);
  const access = dailyAccess(user);
  const canWrite = access.editable && (access.supervisor || workerId === user?.id);
  const initialItem = order.services.filter((item) => item.userId === workerId && item.eligible && !item.blocked);
  const defaultItem = initialItem.length === 1 ? String(initialItem[0].itemId) : '';
  const [draft, setDraft] = useState<DailyDraft>(() => ({
    clientRequestId: crypto.randomUUID(),
    itemId: defaultItem,
    dpStageId: initialItem.length === 1 ? initialItem[0].dpStageId ?? null : null,
    startTime: '',
    hours: '',
    activityStatus: 'en_proceso',
    note: '',
    extraNotes: [],
    files: [],
    savedRequestId: null,
    observationsSaved: false,
    hoursStatus: null,
    useRecordedHours: false,
    progressSaved: false,
  }));
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showAdditions, setShowAdditions] = useState(false);
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(draft);
  latest.current = draft;
  const core = useCreateWorkshopDailyEntry();
  const observations = useSaveDailyObservations();
  const eligible = useWorkshopTimeEligibleItems(
    access.supervisor ? workerId : undefined,
    canWrite,
    date,
  );
  const services = (eligible.data ?? []).filter(
    (item) => item.workOrderId === order.id && item.userId === workerId,
  );
  const coreSaved = Boolean(draft.savedRequestId || draft.progressSaved);
  const pending = working || core.isPending || observations.isPending;
  const dirty = Boolean(
    draft.hours ||
    draft.note ||
    draft.files.length ||
    draft.extraNotes.some((note) => note.trim()) ||
    draft.activityStatus !== 'en_proceso' ||
    draft.itemId !== defaultItem ||
    draft.dpStageId !== (initialItem.length === 1 ? initialItem[0].dpStageId ?? null : null) ||
    draft.savedRequestId ||
    draft.progressSaved,
  );
  const recoveryValue = useMemo(() => draft, [draft]);
  const recovery = useFormRecovery({
    userId: user?.id,
    form: `workshop-daily:${workerId}:${date}:${order.id}`,
    schema: recoverySchema,
    value: recoveryValue,
    hasContent: dirty,
    onRestore: setDraft,
  });
  const selected = order.services.find(
    (item) => item.itemId === Number(draft.itemId) && item.userId === workerId && (item.dpStageId ?? null) === draft.dpStageId,
  );
  const selectionKey = draft.itemId ? dailyServiceKey({ itemId: Number(draft.itemId), dpStageId: draft.dpStageId }) : '';
  const availableService = services.find((item) => dailyServiceKey(item) === selectionKey);
  const set = <K extends keyof DailyDraft>(key: K, value: DailyDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    onState?.(dirty, pending);
  }, [dirty, pending, onState]);
  useEffect(() => () => onState?.(false, false), [onState]);

  const close = () => {
    if (busy.current) return;
    if (dirty || recovery.candidate) setConfirmClose(true);
    else onClose();
  };

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || !canWrite || !recovery.ready) return;
    setError(null);
    let saved = latest.current;
    if (!saved.savedRequestId && !saved.progressSaved) {
      const service = services.find((item) => item.itemId === Number(saved.itemId) && (item.dpStageId ?? null) === saved.dpStageId);
      if (!service) {
        setError('Selecciona un servicio asignado a este trabajador. Tu borrador se conserva.');
        return;
      }
      if (service.blocked) {
        setError('La etapa anterior aún no está terminada. Tu borrador se conserva; no se registraron horas ni avance.');
        return;
      }
      const hours = Number(saved.hours.replace(',', '.'));
      if (!Number.isFinite(hours) || hours < 1 / 60) {
        setError('Indica las horas que utilizaste (como mínimo, un minuto).');
        return;
      }
    }
    const text = [saved.note, ...saved.extraNotes]
      .map((note) => note.trim())
      .filter(Boolean)
      .join('\n\n');
    if (text.length > 2000) {
      setError('Las notas juntas deben tener un máximo de 2000 caracteres.');
      return;
    }
    busy.current = true;
    setWorking(true);
    try {
      if (!saved.savedRequestId && !saved.progressSaved) {
        const request = await core.mutateAsync({
          clientRequestId: saved.clientRequestId,
          workOrderId: order.id,
          itemId: Number(saved.itemId),
          ...(saved.dpStageId ? { dpStageId: saved.dpStageId } : {}),
          ...(access.supervisor ? { userId: workerId } : {}),
          fecha: date,
          horasUtilizadas: Number(saved.hours.replace(',', '.')),
          note:
            saved.note.trim() ||
            `Registro diario: ${services.find((item) => item.itemId === Number(saved.itemId) && (item.dpStageId ?? null) === saved.dpStageId)?.description ?? selected?.description ?? 'Servicio'} · ${saved.activityStatus === 'completado' ? 'Finalizado' : 'Parcial'}`,
          activityStatus: saved.activityStatus,
        });
        saved = { ...saved, savedRequestId: request.id, hoursStatus: request.status };
        latest.current = saved;
        setDraft(saved);
        // Durably remember the core success BEFORE uploading attachments. A
        // recovered partial save must never submit another hours request.
        await recovery.persist(saved);
      }
      if (!saved.observationsSaved && (text || saved.files.length)) {
        await observations.mutateAsync({
          workOrderId: order.id,
          itemId: Number(saved.itemId),
          userId: workerId,
          text,
          files: saved.files.map(
            (photo) =>
              new File([photo.blob], photo.name, {
                type: photo.blob.type,
                lastModified: photo.lastModified,
              }),
          ),
        });
        saved = { ...saved, observationsSaved: true };
        latest.current = saved;
        setDraft(saved);
        await recovery.persist(saved);
      }
      await recovery.clear();
      onComplete(saved.hoursStatus);
    } catch (cause) {
      setError(
        saved.savedRequestId || saved.progressSaved
          ? `${getApiErrorMessage(cause)} Las horas y el avance ya están guardados. Reintenta solo las notas y fotos.`
          : getApiErrorMessage(cause, 'No se pudo guardar el registro. Intenta nuevamente.'),
      );
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const added = [...files];
    if (
      draft.files.length + added.length > WORK_ORDER_OBSERVATION_MAX_FILES ||
      added.some(
        (file) =>
          !WORK_ORDER_OBSERVATION_FILE_MIME_TYPES.some((type) => type === file.type) ||
          !file.type.startsWith('image/') ||
          file.size > WORK_ORDER_OBSERVATION_MAX_FILE_BYTES ||
          !file.size,
      )
    ) {
      setError(
        `Selecciona hasta ${WORK_ORDER_OBSERVATION_MAX_FILES} fotos de hasta ${WORK_ORDER_OBSERVATION_MAX_FILE_BYTES / 1024 / 1024} MB cada una.`,
      );
      return;
    }
    setError(null);
    set('files', [
      ...draft.files,
      ...added.map((file) => ({ name: file.name, lastModified: file.lastModified, blob: file })),
    ]);
  };

  return (
    <>
      <FormDialog
        id="daily-entry-title"
        title="Registro diario"
        code={order.code}
        context={[workerName, date.split('-').reverse().join('-')].filter(Boolean).join(' · ')}
        headerVariant="plain"
        className="daily-entry-dialog"
        dirty={false}
        pending={pending}
        onClose={close}
        onSubmit={(event) => {
          void submit(event);
        }}
        submitLabel={coreSaved ? 'Reintentar notas y fotos' : 'Guardar'}
        submitDisabled={
          !canWrite ||
          !recovery.ready ||
          (!coreSaved && (eligible.isFetching || eligible.isError || !services.some((item) => !item.blocked)))
        }
        statusText=""
      >
        {(!recovery.ready || recovery.candidate || recovery.error) && (
          <FormRecoveryBanner
            candidateAt={recovery.candidate?.updatedAt ?? null}
            ready={recovery.ready}
            saving={recovery.saving}
            savedAt={recovery.savedAt}
            error={recovery.error}
            onRecover={recovery.recover}
            onDiscard={() => {
              void recovery.discard();
            }}
            onRetry={() => {
              void recovery.retry();
            }}
          />
        )}
        {!canWrite && <p role="alert">No tienes permiso para registrar esta jornada.</p>}
        {recovery.ready && (
          <>
            <fieldset className="daily-entry-core" disabled={coreSaved || !canWrite}>
              <label>
                OT
                <input readOnly value={[order.code, order.patente].filter(Boolean).join(' · ')} />
              </label>
              <div className="daily-entry-work">
                <label>
                  Trabajo
                  <select
                    required
                    value={selectionKey}
                    onChange={(event) => {
                      const service = services.find((item) => dailyServiceKey(item) === event.target.value);
                      setDraft((current) => ({ ...current, itemId: service ? String(service.itemId) : '', dpStageId: service?.dpStageId ?? null }));
                    }}
                  >
                    <option value="">Seleccionar trabajo</option>
                    {services.map((item) => (
                      <option key={dailyServiceKey(item)} value={dailyServiceKey(item)} disabled={item.blocked}>
                        {item.description}{item.dpStageLabel && !item.description.includes(item.dpStageLabel) ? ` · ${item.dpStageLabel}` : ''}{item.blocked ? ' · Espera la etapa anterior' : ''}
                      </option>
                    ))}
                    {coreSaved && !availableService && (
                      <option value={selectionKey}>
                        {selected?.description ?? 'Servicio registrado'}
                      </option>
                    )}
                  </select>
                </label>
                <label>
                  Horas utilizadas
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1 / 60}
                    step="any"
                    required
                    placeholder="Ej. 1,5"
                    value={draft.hours}
                    onChange={(event) => set('hours', event.target.value)}
                  />
                </label>
              </div>
              {!coreSaved && availableService?.blocked && <p role="status">Esta etapa espera que termine la anterior. No se registrarán horas ni avance hasta entonces.</p>}
              {!coreSaved && eligible.isError && (
                <p role="alert">
                  {getApiErrorMessage(eligible.error, 'No se pudieron cargar tus servicios.')}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      void eligible.refetch();
                    }}
                  >
                    Reintentar servicios
                  </button>
                </p>
              )}
              {!coreSaved && eligible.isSuccess && !services.length && (
                <p>
                  No hay servicios vigentes para un registro nuevo. Si tienes una captura pendiente,
                  recupérala para completar sus adjuntos.
                </p>
              )}
              <fieldset className="daily-entry-status">
                <legend className="sr-only">Avance</legend>
                <label>
                  <input
                    type="radio"
                    name="daily-activity"
                    checked={draft.activityStatus === 'en_proceso'}
                    onChange={() => set('activityStatus', 'en_proceso')}
                  />
                  Parcial
                </label>
                <label>
                  <input
                    type="radio"
                    name="daily-activity"
                    checked={draft.activityStatus === 'completado'}
                    onChange={() => set('activityStatus', 'completado')}
                  />
                  Finalizado
                </label>
              </fieldset>
            </fieldset>
            <label>
              Nota (opcional)
              <textarea
                rows={2}
                maxLength={2000}
                value={draft.note}
                disabled={!canWrite || draft.observationsSaved}
                onChange={(event) => set('note', event.target.value)}
                placeholder="Añade una observación del trabajo"
              />
            </label>
            {coreSaved && (
              <p className="daily-entry-saved" role="status">
                Horas y avance guardados. Solo faltan las notas y fotos.
              </p>
            )}
            <div className="daily-entry-additions">
              <button
                type="button"
                className="daily-entry-add-button"
                aria-label="Añadir nota o fotos"
                aria-expanded={showAdditions}
                aria-controls="daily-entry-add-options"
                disabled={!canWrite || draft.observationsSaved}
                onClick={() => setShowAdditions((shown) => !shown)}
              >
                <Plus aria-hidden="true" />
                Añadir
              </button>
              {showAdditions && (
                <div id="daily-entry-add-options">
                  <button
                    type="button"
                    disabled={!canWrite || draft.observationsSaved}
                    onClick={() => set('extraNotes', [...draft.extraNotes, ''])}
                  >
                    <Plus aria-hidden="true" />
                    Otra nota
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite || draft.observationsSaved}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Camera aria-hidden="true" />
                    Agregar fotos
                  </button>
                </div>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={WORK_ORDER_OBSERVATION_FILE_MIME_TYPES.filter((type) =>
                type.startsWith('image/'),
              ).join(',')}
              aria-label="Fotos del trabajo"
              className="daily-entry-file-input"
              disabled={!canWrite || draft.observationsSaved}
              onChange={(event) => {
                addPhotos(event.target.files);
                event.target.value = '';
              }}
            />
            {draft.extraNotes.map((note, index) => (
              <div className="daily-entry-extra" key={index}>
                <label>
                  Nota adicional {index + 1}
                  <textarea
                    value={note}
                    maxLength={2000}
                    disabled={!canWrite || draft.observationsSaved}
                    onChange={(event) =>
                      set(
                        'extraNotes',
                        draft.extraNotes.map((current, at) =>
                          at === index ? event.target.value : current,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={!canWrite || draft.observationsSaved}
                  aria-label={`Quitar nota ${index + 1}`}
                  onClick={() =>
                    set(
                      'extraNotes',
                      draft.extraNotes.filter((_, at) => at !== index),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            ))}
            {draft.files.length > 0 && (
              <ul className="daily-entry-photos" aria-label="Fotos seleccionadas">
                {draft.files.map((photo, index) => (
                  <Photo
                    key={`${photo.name}-${photo.lastModified}-${index}`}
                    photo={photo}
                    disabled={pending || !canWrite || draft.observationsSaved}
                    onRemove={() =>
                      set(
                        'files',
                        draft.files.filter((_, at) => at !== index),
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
        {error && (
          <p className="daily-entry-error" role="alert">
            <span>{error}</span>
            <small>Tus datos y fotos se mantienen para que puedas volver a intentarlo.</small>
          </p>
        )}
      </FormDialog>
      {confirmClose && (
        <CloseConfirmation
          pending={pending}
          onCancel={() => setConfirmClose(false)}
          onKeep={() => {
            if (recovery.candidate) onClose();
            else void recovery.persist(latest.current).then(onClose);
          }}
          onDiscard={() => {
            void (recovery.candidate ? recovery.discard() : recovery.clear()).then(onClose);
          }}
        />
      )}
    </>
  );
}
