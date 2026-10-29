import { Clock3, LoaderCircle, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';


interface FormRecoveryBannerProps {
  candidateAt: number | null;
  ready: boolean;
  saving: boolean;
  savedAt: number | null;
  error: boolean;
  onRecover: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}
export default function FormRecoveryBanner(props: FormRecoveryBannerProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!props.ready && !props.candidateAt)
    return (
      <p className="flex items-center gap-2 text-xs text-brand-muted" role="status">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Buscando formulario pendiente…
      </p>
    );
  if (props.candidateAt)
    return (
      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-primary/20 bg-brand-pale p-4"
        aria-label="Formulario pendiente"
      >
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-brand-primaryInk">
            <Clock3 className="h-4 w-4" />
            Tienes un formulario pendiente
          </p>
          <p className="mt-1 text-xs text-brand-muted">
            Guardado en este navegador el {new Date(props.candidateAt).toLocaleString('es-CL')}.
            Puedes continuar donde lo dejaste, incluidas las fotos seleccionadas.
          </p>
        </div>
        {confirmDiscard ? (
          <div className="space-y-2">
            <p className="text-sm text-brand-ink">
              Se descartarán los datos y fotos locales pendientes. Los registros ya guardados en el
              sistema se conservan.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmDiscard(false);
                  props.onDiscard();
                }}
                className="min-h-10 rounded-lg bg-brand-coralInk px-3 text-sm font-bold text-white"
              >
                Descartar captura
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="min-h-10 px-3 text-sm font-semibold"
              >
                Conservar captura
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={props.onRecover}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-primaryInk px-4 text-sm font-semibold text-white"
            >
              <RotateCcw className="h-4 w-4" />
              Recuperar formulario
            </button>
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="min-h-10 rounded-lg border border-brand-line bg-white px-4 text-sm font-semibold text-brand-ink"
            >
              Empezar de nuevo
            </button>
          </div>
        )}
      </section>
    );
  if (props.error)
    return (
      <p
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        No pudimos guardar la recuperación en este navegador. Conserva esta página abierta.{' '}
        <button type="button" onClick={props.onRetry} className="font-bold underline">
          Reintentar guardado local
        </button>
      </p>
    );
  if (!props.savedAt && !props.saving) return null;
  return (
    <p className="flex items-center gap-2 text-xs text-brand-muted" role="status">
      {props.saving ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Save className="h-3.5 w-3.5" />
      )}
      {props.saving ? 'Guardando recuperación…' : 'Recuperación guardada en este navegador'}
    </p>
  );
}
