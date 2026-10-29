import { AlertCircle, CheckCircle2, LoaderCircle, RotateCcw } from 'lucide-react';

import { INSPECTION_PHOTO_ACCEPT } from '../../lib/inspection-photos';

import type { WorkOrderInspectionPhotoSlot } from '@unithor/shared';

export interface PhotoTransferState {
  percent: number;
  error?: string;
}
export default function PendingInspectionPhotos({
  code,
  photos,
  savedSlots,
  transfers,
  busy,
  canUpload,
  onRetry,
  onReplace,
}: {
  code: string;
  photos: Array<{ slot: WorkOrderInspectionPhotoSlot; previewUrl: string; label: string }>;
  savedSlots: WorkOrderInspectionPhotoSlot[];
  transfers: Partial<Record<WorkOrderInspectionPhotoSlot, PhotoTransferState>>;
  busy: boolean;
  canUpload: boolean;
  onRetry: () => void;
  onReplace: (slot: WorkOrderInspectionPhotoSlot, file: File) => void;
}) {
  const pending = photos.filter((photo) => !savedSlots.includes(photo.slot));
  return (
    <section
      className="space-y-4 rounded-xl border border-brand-line bg-white p-4 sm:p-5"
      aria-label="Fotos pendientes de la OT"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-brand-primaryInk">La OT {code} ya está guardada</p>
          <p className="mt-1 text-sm text-brand-muted">
            {savedSlots.length} de {photos.length} fotos guardadas. Los reintentos se aplican sobre
            esta misma orden.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || !canUpload || pending.length === 0}
          onClick={onRetry}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Reintentar fotos pendientes
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => {
          const saved = savedSlots.includes(photo.slot);
          const transfer = transfers[photo.slot];
          return (
            <div
              key={photo.slot}
              className="flex min-w-0 gap-3 rounded-lg border border-brand-line p-3"
            >
              <img
                src={photo.previewUrl}
                alt={photo.label}
                className="h-16 w-20 shrink-0 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-ink">{photo.label}</p>
                <p
                  className={
                    'mt-1 flex items-center gap-1 text-xs ' +
                    (saved ? 'text-brand-mintInk' : 'text-brand-muted')
                  }
                >
                  {saved ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Guardada
                    </>
                  ) : busy && !transfer?.error ? (
                    'Subiendo: ' + (transfer?.percent ?? 0) + '%'
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5" />
                      Pendiente
                    </>
                  )}
                </p>
                {transfer?.error && (
                  <p className="mt-1 break-words text-xs text-brand-coralInk">{transfer.error}</p>
                )}
                {!saved && !busy && canUpload && (
                  <label className="mt-2 inline-flex min-h-8 cursor-pointer items-center text-xs font-semibold text-brand-primaryInk underline">
                    Cambiar archivo
                    <input
                      type="file"
                      accept={INSPECTION_PHOTO_ACCEPT}
                      className="sr-only"
                      aria-label={'Cambiar foto pendiente ' + photo.label}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onReplace(photo.slot, file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!canUpload && (
        <p role="alert" className="text-sm text-brand-coralInk">
          Tu cuenta ya no tiene permiso para subir fotos. La OT y las fotos pendientes se conservan.
        </p>
      )}
      <p className="text-xs text-brand-muted">
        Puedes volver a esta pantalla y recuperar las fotos pendientes desde este navegador. El
        correo esperará a que se complete la carga.
      </p>
    </section>
  );
}
