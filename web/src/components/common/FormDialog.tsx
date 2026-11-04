import { LoaderCircle, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import ModalHeader from './ModalHeader';
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
  headerVariant?: 'plain' | 'brand';
  submitDisabled?: boolean;
  statusText?: ReactNode;
}

/** Scrollable content with persistent actions; an acknowledgement cannot discard a draft. */
export default function FormDialog(props: Props) {
  const [confirmLeave, setConfirmLeave] = useState(false);
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

  return createPortal(<div className={`reception-edit-overlay ${props.headerVariant ? 'reference-modal-overlay' : ''}`}>
    <button type="button" className="reception-edit-backdrop" onClick={requestClose}
      disabled={props.pending} aria-label={`Cerrar ${props.title.toLowerCase()}`} tabIndex={-1} />
    <section role="dialog" aria-modal="true" aria-labelledby={props.id} tabIndex={-1}
      ref={setOverlayNode} className={`reception-edit-dialog ${props.headerVariant ? 'reference-dialog' : ''} ${props.className ?? ''}`}
      aria-busy={props.pending}>
      {props.headerVariant ? <ModalHeader id={props.id} title={props.title} description={<><span>{props.code}</span><span aria-hidden="true"> · </span><span>{props.context}</span></>} badge={props.headerIcon} variant={props.headerVariant} onClose={requestClose} closeDisabled={props.pending} /> : <header className="reception-edit-heading">
        {props.headerIcon && <span className="form-dialog-icon">{props.headerIcon}</span>}<div><p><span>{props.code}</span><span aria-hidden="true"> · </span><span>{props.context}</span></p><h2 id={props.id}>{props.title}</h2></div>
        <button type="button" onClick={requestClose} disabled={props.pending} aria-label="Cerrar"><X aria-hidden="true" /></button>
      </header>}
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
