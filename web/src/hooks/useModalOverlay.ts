import { RefObject, useCallback, useEffect, useRef } from 'react';

interface ModalOverlayOptions {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Mientras una mutacion esta en vuelo se ignora Escape: cerrar a mitad de un
   * guardado deja la UI en un estado que el backend ya decidio.
   */
  isPending?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  labelledBy?: string;
}

/**
 * Comportamiento compartido por todos los overlays de la aplicacion.
 *
 * Antes cada modal reimplementaba scroll lock, foco y Escape por su cuenta, con
 * el resultado de que solo 9 de 20 cerraban con Escape: no era un descuido
 * puntual sino que no habia un unico lugar donde el cierre se cumpliera. La
 * referencia de Modernize lo obtiene gratis con `<dialog>` nativo; aqui se
 * resuelve con un hook para no tener que migrar los overlays a `<dialog>`.
 *
 * Devuelve un callback ref para el panel del dialogo. Se prefiere sobre un ref
 * de objeto porque `motion` tipa sus refs con la variante no nulable de React 19
 * y un `RefObject<HTMLElement | null>` no le encaja.
 */
export const useModalOverlay = ({
  isOpen,
  onClose,
  isPending = false,
  initialFocusRef,
  labelledBy,
}: ModalOverlayOptions): ((node: HTMLElement | null) => void) => {
  const nodeRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const isPendingRef = useRef(isPending);

  const setPanelNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  // Se sincronizan en un efecto propio y NO se leen durante el render, para que
  // el efecto de abajo dependa solo de `isOpen`. Con un `onClose` inline,
  // ponerlo en las dependencias re-ejecutaria el efecto en cada render y el foco
  // volveria al disparador mientras el usuario escribe en un campo.
  useEffect(() => {
    onCloseRef.current = onClose;
    isPendingRef.current = isPending;
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const previouslyFocused = document.activeElement;
    const panel = nodeRef.current;
    const focusTarget = initialFocusRef?.current ?? panel;
    // Solo se enfoca el panel si el foco no quedo dentro. Varios formularios
    // usan `autoFocus` en su primer campo y las dos politicas se pelearian.
    if (focusTarget && !focusTarget.contains(document.activeElement)) {
      focusTarget.focus();
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isPendingRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, initialFocusRef, labelledBy]);

  return setPanelNode;
};
