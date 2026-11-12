import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/auth.store';
import AppLayout from '../AppLayout';

// Keep real layout, navigation, modal stack, install hook and draft state.
// No transport or operational queries are needed for these shell regressions.
vi.mock('../../../hooks/useSalesAccessSession', () => ({ useSalesAccessSession: () => 'test' }));
vi.mock('../../../hooks/useDashboard', () => ({ useDashboardSummary: () => ({ data: undefined }) }));
vi.mock('../../../hooks/useAuth', () => ({ useLogoutMutation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('../NotificationBell', () => ({ default: () => <button>Notificaciones</button> }));
vi.mock('../UserMenu', () => ({ default: () => null }));
vi.mock('../../common/CustomerEmailPreparation', () => ({ default: () => null }));

function DraftPage() {
  const [notes, setNotes] = useState('');
  return <label>Notas de recepción<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>;
}

const renderLayout = () => render(<MemoryRouter initialEntries={['/work-orders/new']}><Routes><Route element={<AppLayout />}><Route path="/work-orders/new" element={<DraftPage />} /></Route></Routes></MemoryRouter>);

describe('mobile More navigation', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 1, nombre: 'Jefe', email: 'qa@example.test', role: 'jefe' }, isAuthenticated: true });
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    useAuthStore.setState({ user: null });
  });

  it('opens More without a sidebar and restores the same draft and trigger on Escape', () => {
    renderLayout();
    const notes = screen.getByLabelText('Notas de recepción');
    fireEvent.change(notes, { target: { value: 'OT sin guardar' } });
    const more = screen.getByRole('button', { name: 'Abrir todas las secciones' });
    more.focus();
    expect(document.querySelector('.sidebar')).toBeNull();
    fireEvent.click(more);
    expect(screen.getByRole('dialog', { name: 'Más opciones' })).toHaveFocus();
    expect(document.querySelector('#shell-content')).toHaveAttribute('inert');
    expect(document.querySelector('.tabbar')).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('#shell-content')).not.toHaveAttribute('inert');
    expect(screen.getByLabelText('Notas de recepción')).toBe(notes);
    expect(notes).toHaveValue('OT sin guardar');
    expect(more).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('opens installation above More and closes only the top modal on Escape', async () => {
    renderLayout();
    const notes = screen.getByLabelText('Notas de recepción');
    fireEvent.change(notes, { target: { value: 'Recepción pendiente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    const more = screen.getByRole('dialog', { name: 'Más opciones' });
    const install = within(more).getByRole('button', { name: 'Cómo instalar UNITHOR' });
    install.focus();
    fireEvent.click(install);
    const dialog = await screen.findByRole('dialog', { name: 'Instalar UNITHOR' });
    expect(more).not.toContainElement(dialog);
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveTextContent('Consultar y guardar datos requiere conexión');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Instalar UNITHOR' })).not.toBeInTheDocument());
    expect(more).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(install).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(notes).toHaveValue('Recepción pendiente');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes More when crossing the desktop breakpoint without remounting the form', () => {
    const desktop = Object.assign(new EventTarget(), { matches: false });
    const displayMode = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
      (query === '(min-width: 1024px)' ? desktop : displayMode) as unknown as MediaQueryList);
    renderLayout();
    const notes = screen.getByLabelText('Notas de recepción');
    fireEvent.change(notes, { target: { value: 'Borrador al rotar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir todas las secciones' }));
    act(() => { desktop.matches = true; desktop.dispatchEvent(new Event('change')); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navegación principal (móvil)' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Menú de navegación' })).toBeInTheDocument();
    expect(screen.getByLabelText('Notas de recepción')).toBe(notes);
    expect(notes).toHaveValue('Borrador al rotar');
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
