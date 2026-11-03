import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CSSProperties, FocusEventHandler, PointerEventHandler, ReactNode, RefObject } from 'react';

interface Props {
  anchorRef: RefObject<HTMLElement>;
  id: string;
  label: string;
  role?: 'region' | 'menu';
  minWidth?: number;
  className?: string;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  onBlurCapture?: FocusEventHandler<HTMLDivElement>;
  onClose: () => void;
  children: ReactNode;
}

/** Anchored outside the animated grid, so expanding a card never moves its neighbours. */
export default function WorkOrderCardPopover({ anchorRef, id, label, role = 'region', minWidth = 0, className = '', onPointerEnter, onPointerLeave, onBlurCapture, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const trigger = document.activeElement;
    const update = () => {
      const bounds = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.innerHeight;
      if (bounds.bottom < 0 || bounds.top > viewportHeight) { onClose(); return; }
      const width = Math.min(Math.max(bounds.width || 300, minWidth), viewportWidth - 24);
      const availableBelow = viewportHeight - bounds.bottom - 12;
      const availableAbove = bounds.top - 12;
      const upwards = availableBelow < Math.min(panel.scrollHeight, 180) && availableAbove > availableBelow;
      const maxHeight = Math.max(100, upwards ? availableAbove : availableBelow);
      const height = Math.min(panel.scrollHeight, maxHeight);
      setPosition({
        visibility: 'visible',
        width,
        maxHeight,
        left: Math.max(12, Math.min(bounds.left, viewportWidth - width - 12)),
        top: upwards ? Math.max(12, bounds.top - height + 1) : Math.max(12, bounds.bottom - 1),
      });
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.contains(event.target) && !panel.contains(event.target)) onClose();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (role === 'menu' && panel.contains(document.activeElement) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const options = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = options.findIndex((button) => button === document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
        event.preventDefault();
        options[next]?.focus();
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(anchor);
    observer?.observe(panel);
    update();
    if (role === 'menu') panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer?.disconnect();
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, minWidth, onClose, role]);

  return createPortal(
    <div ref={panelRef} id={id} role={role} aria-label={label} className={`workshop-card-popover ${className}`} style={position} onPointerOver={onPointerEnter} onPointerOut={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) onPointerLeave?.(event); }} onBlurCapture={onBlurCapture}>
      {children}
    </div>,
    document.body,
  );
}
