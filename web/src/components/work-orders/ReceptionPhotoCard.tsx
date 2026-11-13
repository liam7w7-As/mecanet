import { Camera, Check, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { useId, useState } from 'react';

import { formatBytes, INSPECTION_PHOTO_ACCEPT, MAX_INSPECTION_PHOTO_MB, validateInspectionFile } from '../../lib/inspection-photos';

export default function ReceptionPhotoCard({ label, guideImage, hint, photo, canUpload, onSelect }: {
  label: string;
  guideImage: string;
  hint: string;
  photo?: { file: File; previewUrl: string };
  canUpload: boolean;
  onSelect: (file: File | null) => void;
}) {
  const id = useId();
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const loading = Boolean(photo && readyUrl !== photo.previewUrl && failedUrl !== photo.previewUrl);
  const error = fileError ?? (photo && failedUrl === photo.previewUrl ? 'No se pudo leer la foto. Elige otra imagen.' : null);
  const selectFile = (file?: File) => {
    if (!file || !canUpload) return;
    const validation = validateInspectionFile(file);
    setFileError(validation);
    if (!validation) onSelect(file);
  };
  return <div className="reception-photo-card overflow-hidden rounded-lg border border-brand-line bg-white">
    <div className="flex items-center justify-between gap-2 border-b border-brand-line px-3 py-2">
      <p className="text-sm font-semibold text-brand-ink">{label}</p>
      {photo && !loading && !error && <span className="reception-photo-ready"><Check aria-hidden="true" />Lista para guardar</span>}
      {photo && canUpload && <button type="button" className="reception-photo-remove" aria-label={`Eliminar foto ${label}`}
        onClick={() => { onSelect(null); setFileError(null); }}><Trash2 aria-hidden="true" />Quitar</button>}
    </div>
    <div className="reception-photo-body" data-has-photo={Boolean(photo)} aria-busy={loading}>
      {photo ? <div className="reception-photo-preview">
        <img src={photo.previewUrl} alt={label} onLoad={() => setReadyUrl(photo.previewUrl)} onError={() => setFailedUrl(photo.previewUrl)} />
        {loading && <div className="reception-photo-loading" role="status"><LoaderCircle aria-hidden="true" />Preparando foto…</div>}
      </div> : <div className="reception-photo-guide"><img src={guideImage} alt={`Ejemplo de foto: ${label}`} width={1080} height={480} loading="lazy" /><p>{hint}</p></div>}
      {photo && <p className="reception-photo-file" title={photo.file.name}><span>{photo.file.name}</span><strong>{formatBytes(photo.file.size)}</strong></p>}
      <p id={`${id}-limits`} className="reception-photo-limits">JPG, PNG o WebP · máximo {MAX_INSPECTION_PHOTO_MB} MB</p>
      {error && <p id={`${id}-error`} className="reception-photo-error" role="alert">{error}</p>}
      {canUpload ? <span className="reception-photo-actions flex gap-2">
        <label><Upload aria-hidden="true" /><span data-short-label={photo ? 'Cambiar' : 'Subir'}>{photo ? 'Reemplazar foto' : 'Elegir archivo'}</span>
          <input type="file" accept={INSPECTION_PHOTO_ACCEPT} className="sr-only" aria-label={`Subir foto ${label}`}
            aria-describedby={`${id}-limits${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)}
            onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        <label><Camera aria-hidden="true" /><span data-short-label="Cámara">Cámara</span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={`Usar cámara ${label}`}
            aria-describedby={`${id}-limits`} onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
      </span> : <span className="text-xs text-brand-muted">Sin permiso para adjuntar fotografías</span>}
    </div>
  </div>;
}
