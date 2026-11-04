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
/**
 * Contador de bloqueos activos. Varios overlays pueden apilarse (una ficha que
 * abre un formulario, un drawer con un modal encima): cada uno guarda y
 * restaura por su cuenta, y con dos locks en el mismo componente el último
 * cleanup en correr dejaba `body` en `hidden` para siempre — el scroll
 * desaparecía hasta recargar. Con contador, el overflow se restaura solo
 * cuando se cierra el último overlay.
 */
let activeLocks = 0;
let overflowBeforeFirstLock = '';
let rootOverflowBeforeFirstLock = '';
let focusBeforeFirstLock: Element | null = null;
const overlayStack: symbol[] = [];

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

    if (activeLocks === 0) {
      overflowBeforeFirstLock = document.body.style.overflow;
      rootOverflowBeforeFirstLock = document.documentElement.style.overflow;
      focusBeforeFirstLock = document.activeElement;
    }
    activeLocks += 1;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const layer = Symbol('modal');
    overlayStack.push(layer);

    const previouslyFocused = document.activeElement;
    const panel = nodeRef.current;
    const focusTarget = initialFocusRef?.current ?? panel;
    // Solo se enfoca el panel si el foco no quedo dentro. Varios formularios
    // usan `autoFocus` en su primer campo y las dos politicas se pelearian.
    if (focusTarget && !focusTarget.contains(document.activeElement)) {
      focusTarget.focus();
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (overlayStack.at(-1) !== layer || event.defaultPrevented) return;
      // A calendar or searchable select may render its popup in a portal.
      const ownedPopups = Array.from(panel?.querySelectorAll('[aria-expanded="true"][aria-controls]') ?? [])
        .flatMap((control) => (control.getAttribute('aria-controls') ?? '').split(' '))
        .map((id) => document.getElementById(id)).filter((popup) => popup !== null);
      if (ownedPopups.some((popup) => event.key === 'Escape' || popup.contains(event.target as Node))) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!isPendingRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>(
        'a[href],button,input:not([type="hidden"]),textarea,select,summary,[tabindex]',
      )).filter((element) => {
        if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
        const collapsed = element.closest('details:not([open])');
        if (collapsed && !collapsed.querySelector('summary')?.contains(element)) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); panel.focus(); return; }
      if (!panel.contains(document.activeElement) || document.activeElement === panel) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const layerIndex = overlayStack.indexOf(layer);
      const wasTop = overlayStack.at(-1) === layer;
      if (layerIndex !== -1) overlayStack.splice(layerIndex, 1);
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) {
        document.body.style.overflow = overflowBeforeFirstLock;
        document.documentElement.style.overflow = rootOverflowBeforeFirstLock;
      }
      const returnFocus = previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected
        ? previouslyFocused : activeLocks === 0 ? focusBeforeFirstLock : null;
      if (wasTop && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
        returnFocus.focus();
      }
    };
  }, [isOpen, initialFocusRef, labelledBy]);

  return setPanelNode;
};
