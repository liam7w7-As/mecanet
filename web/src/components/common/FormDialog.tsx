import { LoaderCircle, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalOverlay } from '../../hooks/useModalOverlay';

import type { FormEvent, ReactNode } from 'react';

interface Props {
  id: string;
  title: string;
  code: string;
  context: string;
  submitLabel: string;
  dirty: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  className?: string;
  headerIcon?: ReactNode;
  submitDisabled?: boolean;
  statusText?: ReactNode;
}

/** Scrollable content with persistent actions; an acknowledgement cannot discard a draft. */
export default function FormDialog(props: Props) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const requestClose = () => {
    if (props.pending) return;
    if (props.dirty) setConfirmLeave(true);
    else props.onClose();
  };
  const setOverlayNode = useModalOverlay({ isOpen: true, onClose: requestClose, isPending: props.pending });

  useEffect(() => {
    if (!props.dirty && !props.pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [props.dirty, props.pending]);

  return createPortal(<div className="reception-edit-overlay">
    <button type="button" className="reception-edit-backdrop" onClick={requestClose}
      disabled={props.pending} aria-label={`Cerrar ${props.title.toLowerCase()}`} tabIndex={-1} />
    <section role="dialog" aria-modal="true" aria-labelledby={props.id} tabIndex={-1}
      ref={(node) => { panelRef.current = node; setOverlayNode(node); }} className={`reception-edit-dialog ${props.className ?? ''}`}
      aria-busy={props.pending} onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const targets = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((node) => node.getClientRects().length > 0);
        const first = targets[0]; const last = targets[targets.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first.focus(); }
      }}>
      <header className="reception-edit-heading">
        {props.headerIcon && <span className="form-dialog-icon">{props.headerIcon}</span>}<div><p><span>{props.code}</span><span aria-hidden="true"> · </span><span>{props.context}</span></p><h2 id={props.id}>{props.title}</h2></div>
        <button type="button" onClick={requestClose} disabled={props.pending} aria-label="Cerrar"><X aria-hidden="true" /></button>
      </header>
      <form onSubmit={(event) => { if (props.pending || props.submitDisabled) event.preventDefault(); else props.onSubmit(event); }}>
        <fieldset className="reception-edit-body" disabled={props.pending}>{props.children}</fieldset>
          <footer className="reception-edit-footer">
            {confirmLeave && <div role="alertdialog" aria-label="Descartar edición" className="reception-discard">
              <p>Hay cambios sin guardar.</p>
              <button type="button" disabled={props.pending} onClick={() => setConfirmLeave(false)}>Seguir editando</button>
              <button type="button" disabled={props.pending} onClick={props.onClose}>Descartar cambios</button>
            </div>}
            <span role="status">{props.pending ? 'Guardando cambios…' : props.statusText ?? (props.dirty ? 'Cambios sin guardar' : 'Sin cambios pendientes')}</span>
            <div><button type="button" disabled={props.pending} onClick={requestClose} className="reception-secondary-button">Cancelar</button>
              <button type="submit" disabled={props.pending || props.submitDisabled} className="reception-primary-button">{props.pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{props.submitLabel}</button></div>
          </footer>
      </form>
    </section>
  </div>, document.body);
}
