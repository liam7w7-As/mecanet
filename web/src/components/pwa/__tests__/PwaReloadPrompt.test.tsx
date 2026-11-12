import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
