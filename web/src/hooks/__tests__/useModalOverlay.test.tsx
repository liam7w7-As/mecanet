import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';

import DatePicker from '../../components/common/DatePicker';
import { useModalOverlay } from '../useModalOverlay';

import type { ReactNode } from 'react';

const Dialog = ({ title, onClose, pending = false, children }: {
  title: string; onClose: () => void; pending?: boolean; children: ReactNode;
}) => {
  const panelRef = useModalOverlay({ isOpen: true, onClose, isPending: pending });
  return createPortal(<section ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
    <button type="button" onClick={onClose} disabled={pending}>Cerrar {title}</button>
    {children}
  </section>, document.body);
};

const NestedForms = ({ pendingChild = false }: { pendingChild?: boolean }) => {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setParentOpen(true)}>Abrir ficha</button>
    {parentOpen && <Dialog title="Ficha" onClose={() => setParentOpen(false)}>
      <input aria-label="Nombre" defaultValue="Cliente registrado" />
      <DatePicker label="Fecha" value="" onChange={() => {}} />
      <button type="button" onClick={() => setChildOpen(true)}>Editar datos</button>
      {childOpen && <Dialog title="Formulario" pending={pendingChild} onClose={() => setChildOpen(false)}>
        <input aria-label="Nombre editado" defaultValue="Cliente registrado" />
      </Dialog>}
    </Dialog>}
  </>;
};

describe('useModalOverlay', () => {
  it('cierra solo el modal superior, conserva el bloqueo y devuelve el foco al origen', () => {
    const overflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'scroll';
    document.documentElement.style.overflow = 'clip auto';
    render(<NestedForms />);
    const trigger = screen.getByRole('button', { name: 'Abrir ficha' });
    trigger.focus(); fireEvent.click(trigger);
    const edit = screen.getByRole('button', { name: 'Editar datos' });
    edit.focus(); fireEvent.click(edit);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Formulario' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Ficha' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(edit).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.documentElement.style.overflow).toBe('clip auto');
    expect(trigger).toHaveFocus();
    document.body.style.overflow = overflow;
    document.documentElement.style.overflow = rootOverflow;
  });

  it('bloquea Escape en ambos niveles mientras el formulario superior está guardando', () => {
    const view = render(<NestedForms pendingChild />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(document.body.style.overflow).toBe('hidden');
    view.rerender(<NestedForms pendingChild={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('mantiene Tab y Shift+Tab dentro del formulario activo', () => {
    render(<NestedForms />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Ficha' }));
    const first = dialog.getByRole('button', { name: 'Cerrar Ficha' });
    const last = dialog.getByRole('button', { name: 'Editar datos' });
    last.focus(); fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('permite cerrar el calendario en un portal sin cerrar la ficha que lo contiene', () => {
    render(<NestedForms />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fecha' }));
    expect(screen.getByRole('dialog', { name: 'Calendario: fecha' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Calendario: fecha' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Ficha' })).toBeInTheDocument();
  });
});
