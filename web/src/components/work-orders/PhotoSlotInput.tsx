import { Camera, ImagePlus, LoaderCircle } from 'lucide-react';

import { ProgressBar } from '../common/LoadingIndicator';
import { INSPECTION_PHOTO_ACCEPT, MAX_INSPECTION_PHOTO_MB } from '../../lib/inspection-photos';
import { notifyError } from '../../stores/toast.store';
import { validateInspectionFile } from '../../lib/inspection-photos';

interface PhotoSlotInputProps {
  slotLabel: string;
  disabled?: boolean;
  busy?: boolean;
  progress?: number | null;
  variant?: 'empty' | 'replace';
  onSelect: (file: File) => void;
}

/**
 * Selector de foto por slot: subir archivo o usar la cámara.
 * El input con capture="environment" abre la cámara trasera en el
 * wrapper móvil; en desktop actúa como selector normal.
 */
export const PhotoSlotInput = ({
  slotLabel,
  disabled = false,
  busy = false,
  progress = null,
  variant = 'empty',
  onSelect,
}: PhotoSlotInputProps) => {
  const handleFile = (file: File | undefined): void => {
    if (!file || disabled || busy) return;
    const error = validateInspectionFile(file);
    if (error) {
      notifyError(`${slotLabel}: ${error}`);
      return;
    }
    onSelect(file);
  };

  if (variant === 'replace') {
    return (
      <span className="absolute bottom-2 right-2 flex gap-1.5">
        <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white/95 px-3 text-xs font-bold text-brand-blue shadow hover:bg-brand-light">
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
          Reemplazar
          <input
            type="file"
            accept={INSPECTION_PHOTO_ACCEPT}
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
            aria-label={`Reemplazar foto ${slotLabel}`}
          />
        </label>
        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-white/95 px-2.5 text-brand-blue shadow hover:bg-brand-light" title="Usar cámara">
          <Camera className="h-4 w-4" aria-hidden="true" />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
            aria-label={`Usar cámara ${slotLabel}`}
          />
        </label>
      </span>
    );
  }

  return (
    <span className="flex h-40 flex-col items-center justify-center gap-2 bg-slate-50 px-3 text-center">
      {busy ? (
        <LoaderCircle className="h-7 w-7 animate-spin text-brand-blue" aria-hidden="true" />
      ) : (
        <>
          <ImagePlus className="h-7 w-7 text-slate-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-500">Subir foto</span>
          <span className="text-[11px] font-normal text-slate-400">
            JPG, PNG o WebP · máx {MAX_INSPECTION_PHOTO_MB} MB
          </span>
        </>
      )}
      {progress !== null && (
        <span className="w-full max-w-44">
          <ProgressBar value={progress} label={`Subiendo ${slotLabel}`} />
        </span>
      )}
      <span className="flex gap-2">
        <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-brand-blue bg-white px-3 text-xs font-bold text-brand-blue hover:bg-brand-light ${disabled || busy ? 'pointer-events-none opacity-50' : ''}`}>
          <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
          Elegir archivo
          <input
            type="file"
            accept={INSPECTION_PHOTO_ACCEPT}
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
            aria-label={`Subir foto ${slotLabel}`}
          />
        </label>
        <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-3 text-xs font-bold text-white hover:bg-brand-dark ${disabled || busy ? 'pointer-events-none opacity-50' : ''}`}>
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Cámara
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
            aria-label={`Usar cámara ${slotLabel}`}
          />
        </label>
      </span>
    </span>
  );
};

export default PhotoSlotInput;
