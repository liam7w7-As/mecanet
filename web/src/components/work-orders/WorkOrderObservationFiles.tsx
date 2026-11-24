import { Download, FileText, ImageOff, LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';
import { api } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/api-error';

import type { WorkOrderWorksheetObservationFile } from '../../types/entities';

const isImage = (file: WorkOrderWorksheetObservationFile): boolean =>
  ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType);

function ImagePreview({ file, onClose }: { file: WorkOrderWorksheetObservationFile; onClose: () => void }) {
  const titleId = useId();
  const panelRef = useModalOverlay({ isOpen: true, onClose, labelledBy: titleId });
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);
    // Use the central client so an expired access cookie can refresh normally.
    void api.get<Blob>(file.url.replace(/^\/api(?=\/)/, ''), { responseType: 'blob' })
      .then(({ data }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([data], { type: file.mimeType }));
        setUrl(objectUrl);
      })
      .catch((failure: unknown) => {
        if (active) setError(getApiErrorMessage(failure, 'No se pudo cargar la imagen. Puedes reintentar.'));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.url, file.mimeType, attempt]);

  return createPortal(<div className="workshop-file-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="workshop-file-preview" tabIndex={-1}>
      <header><h2 id={titleId}>{file.nombreOriginal}</h2><button type="button" aria-label="Cerrar imagen" onClick={onClose}><X aria-hidden="true" /></button></header>
      <div className="workshop-file-preview-body">
        {!url && !error && <p role="status"><LoaderCircle className="animate-spin" aria-hidden="true" />Cargando imagen…</p>}
        {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button></div>}
        {url && <img src={url} alt={file.nombreOriginal} />}
      </div>
      {url && <footer><a href={url} download={file.nombreOriginal}><Download aria-hidden="true" />Descargar original</a></footer>}
    </section>
  </div>, document.body);
}

function Thumbnail({ file, onOpen }: { file: WorkOrderWorksheetObservationFile; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  return <button type="button" className="workshop-job-file" aria-label={`Ver imagen ${file.nombreOriginal}`} onClick={onOpen}>
    {failed ? <ImageOff aria-hidden="true" /> : <img src={file.url} alt="" loading="lazy" onError={() => setFailed(true)} />}
    <span>{file.nombreOriginal}</span>
  </button>;
}

export default function WorkOrderObservationFiles({ files }: { files: readonly WorkOrderWorksheetObservationFile[] }) {
  const [selected, setSelected] = useState<WorkOrderWorksheetObservationFile | null>(null);
  if (!files.length) return null;
  return <div className="workshop-job-files" aria-label="Adjuntos del trabajo">
    {files.map((file) => isImage(file)
      ? <Thumbnail key={file.id} file={file} onOpen={() => setSelected(file)} />
      : <a key={file.id} className="workshop-job-file" href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir documento ${file.nombreOriginal}`}><FileText aria-hidden="true" /><span>{file.nombreOriginal}</span><small>PDF · Abrir</small></a>)}
    {selected && <ImagePreview file={selected} onClose={() => setSelected(null)} />}
  </div>;
}
