import { Camera, ImagePlus, LoaderCircle } from 'lucide-react';

import { INSPECTION_PHOTO_ACCEPT, MAX_INSPECTION_PHOTO_MB } from '../../lib/inspection-photos';
import { validateInspectionFile } from '../../lib/inspection-photos';
import { notifyError } from '../../stores/toast.store';
import { ProgressBar } from '../common/LoadingIndicator';

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
        <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white/95 px-3 text-xs font-bold text-brand-primaryInk shadow hover:bg-brand-line/40">
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
        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg bg-white/95 px-2.5 text-brand-primaryInk shadow hover:bg-brand-line/40" title="Usar cámara">
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
    <span className="flex h-40 flex-col items-center justify-center gap-2 bg-brand-line/40 px-3 text-center">
      {busy ? (
        <LoaderCircle className="h-7 w-7 animate-spin text-brand-primaryInk" aria-hidden="true" />
      ) : (
        <>
          <ImagePlus className="h-7 w-7 text-brand-muted" aria-hidden="true" />
          <span className="text-sm font-semibold text-brand-muted">Subir foto</span>
          <span className="text-[11px] font-normal text-brand-muted">
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
        <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-brand-primaryInk bg-white px-3 text-xs font-bold text-brand-primaryInk hover:bg-brand-line/40 ${disabled || busy ? 'pointer-events-none opacity-50' : ''}`}>
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
        <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand-primaryInk px-3 text-xs font-bold text-white hover:bg-brand-primaryInkHover ${disabled || busy ? 'pointer-events-none opacity-50' : ''}`}>
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
