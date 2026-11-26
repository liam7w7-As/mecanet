import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as pwaUpdates from '../../../lib/pwa-updates';
import { usePwaUpdateStore } from '../../../stores/pwa-update.store';
import PwaReloadPrompt from '../PwaReloadPrompt';

import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

const sw = vi.hoisted(() => ({
  options: {} as RegisterSWOptions,
  needRefresh: true,
  offlineReady: false,
  update: vi.fn<(_reload?: boolean) => Promise<void>>(),
}));

vi.mock('virtual:pwa-register/react', async () => {
  const { useState } = await import('react');
  return {
    useRegisterSW(options: RegisterSWOptions) {
      sw.options = options;
      return { needRefresh: useState(sw.needRefresh), offlineReady: useState(sw.offlineReady), updateServiceWorker: sw.update };
    },
  };
});

function Workspace() {
  const [notes, setNotes] = useState('');
  return <><label>Notas OT/COT<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><PwaReloadPrompt /></>;
}

describe('PWA updates with open drafts', () => {
  beforeEach(() => {
    sw.needRefresh = true;
    sw.offlineReady = false;
    sw.update.mockReset().mockResolvedValue(undefined);
    usePwaUpdateStore.setState({ check: null, checking: false });
  });
  afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'serviceWorker'); });

  const registerWaitingWorker = () => {
    const active = Object.assign(new EventTarget(), { state: 'activated' });
    const waiting = Object.assign(new EventTarget(), { state: 'installed' });
    const registration = Object.assign(new EventTarget(), { active, waiting, installing: null, update: vi.fn() });
    registration.update.mockResolvedValue(registration);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: active } });
    act(() => sw.options.onRegisteredSW?.('/sw.js', registration as unknown as ServiceWorkerRegistration));
    return { registration, waiting };
  };

  it('completes a confirmed reload when activation does not claim the current page', async () => {
    const reload = vi.spyOn(pwaUpdates, 'reloadPwaPage').mockImplementation(() => {});
    render(<Workspace />);
    const { waiting } = registerWaitingWorker();
    fireEvent.change(screen.getByLabelText('Notas OT/COT'), { target: { value: 'Borrador conservado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar y recargar' }));
    await waitFor(() => expect(sw.update).toHaveBeenCalledOnce());
    act(() => { waiting.state = 'activated'; waiting.dispatchEvent(new Event('statechange')); });
    expect(reload).toHaveBeenCalledOnce();
    act(() => sw.options.onNeedReload?.());
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps drafts open if another tab activates the waiting worker', () => {
    const reload = vi.spyOn(pwaUpdates, 'reloadPwaPage').mockImplementation(() => {});
    render(<Workspace />);
    const { waiting } = registerWaitingWorker();
    fireEvent.change(screen.getByLabelText('Notas OT/COT'), { target: { value: 'Conservar mi OT' } });
    act(() => { waiting.state = 'activated'; waiting.dispatchEvent(new Event('statechange')); });
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Notas OT/COT')).toHaveValue('Conservar mi OT');
    expect(screen.getByText('Nueva versión disponible')).toBeInTheDocument();
  });

  it('shows a dismissed waiting update again after returning to the app', async () => {
    render(<Workspace />);
    registerWaitingWorker();
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
    act(() => window.dispatchEvent(new Event('focus')));
    expect(await screen.findByText('Nueva versión disponible')).toBeInTheDocument();
  });

  it('preserves the draft on an available update and requires a separate reload confirmation', async () => {
    render(<Workspace />);
    const notes = screen.getByLabelText('Notas OT/COT');
    fireEvent.change(notes, { target: { value: 'Trabajo pendiente sin guardar' } });
    expect(sw.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    expect(screen.getByText(/Los cambios sin guardar/)).toBeInTheDocument();
    expect(sw.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
    expect(notes).toHaveValue('Trabajo pendiente sin guardar');
    expect(sw.update).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
  });

  it('activates the waiting worker only after confirming the reload', async () => {
    render(<Workspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar y recargar' }));
    await waitFor(() => expect(sw.update).toHaveBeenCalledOnce());
    expect(sw.update).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Actualizando...' })).toBeDisabled();
  });

  it('keeps this tab and draft open when another tab activates the worker', () => {
    sw.needRefresh = false;
    render(<Workspace />);
    const notes = screen.getByLabelText('Notas OT/COT');
    fireEvent.change(notes, { target: { value: 'COT en edición' } });
    act(() => { sw.options.onNeedReload?.(); });
    expect(screen.getByText('Nueva versión disponible')).toBeInTheDocument();
    expect(notes).toHaveValue('COT en edición');
    expect(sw.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    expect(notes).toHaveValue('COT en edición');
    expect(sw.update).not.toHaveBeenCalled();
  });

  it('shows an actionable failure and permits retry while preserving the draft', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      sw.update.mockRejectedValueOnce(new Error('Worker unavailable'));
      render(<Workspace />);
      fireEvent.change(screen.getByLabelText('Notas OT/COT'), { target: { value: 'OT pendiente' } });
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar y recargar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar');
      expect(screen.getByLabelText('Notas OT/COT')).toHaveValue('OT pendiente');
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar y recargar' }));
      await waitFor(() => expect(sw.update).toHaveBeenCalledTimes(2));
    } finally { error.mockRestore(); }
  });

  it('describes shell caching without promising offline data or saves', () => {
    sw.needRefresh = false;
    sw.offlineReady = true;
    render(<PwaReloadPrompt />);
    expect(screen.getByText('Interfaz disponible sin conexión')).toBeInTheDocument();
    expect(screen.getByText(/Consultar y guardar datos requiere conexión/)).toBeInTheDocument();
    expect(screen.queryByText('Listo para trabajar sin conexión')).not.toBeInTheDocument();
    expect(sw.update).not.toHaveBeenCalled();
  });
});
