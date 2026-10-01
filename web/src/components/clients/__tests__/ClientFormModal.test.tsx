import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import ClientFormModal from '../ClientFormModal';

import type { Client } from '../../../types/entities';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({ api: { post: vi.fn(), patch: vi.fn() } }));

const savedClient: Client = {
  id: 7,
  nombre: 'Ana Pérez',
  tipo: 'cliente',
  rut: '123456785',
  email: null,
  telefono: null,
  direccion: null,
  region: null,
  comuna: null,
  notas: null,
  createdAt: '',
  updatedAt: '',
};

const mount = (client?: Client) => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ClientFormModal client={client} onSaved={onSaved} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onSaved, onClose };
};

const fillName = () =>
  fireEvent.change(screen.getByRole('textbox', { name: 'Nombre completo' }), {
    target: { value: 'Ana Pérez' },
  });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));

describe('ClientFormModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.post).mockResolvedValue({ data: { client: savedClient } } as AxiosResponse);
    vi.mocked(api.patch).mockResolvedValue({ data: { client: savedClient } } as AxiosResponse);
  });

  it('formats RUN/RUT as it is typed and submits normalized data with a regional phone', async () => {
    const { onSaved, onClose } = mount();
    fillName();
    const rut = screen.getByRole('textbox', { name: 'RUN / RUT' });
    fireEvent.change(rut, { target: { value: '123456785' } });
    expect(rut).toHaveValue('12.345.678-5');
    fireEvent.change(screen.getByRole('textbox', { name: 'Teléfono' }), {
      target: { value: '55 234 5678' },
    });
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.post).toHaveBeenCalledWith(
      '/clients',
      expect.objectContaining({ rut: '123456785', telefono: '+56552345678' }),
    );
    expect(onSaved).toHaveBeenCalledWith(savedClient);
  });

  it('supports K and deleting a separator without trapping the cursor', () => {
    mount();
    const rut = screen.getByRole('textbox', { name: 'RUN / RUT' }) as HTMLInputElement;
    fireEvent.change(rut, { target: { value: '6000000k' } });
    expect(rut).toHaveValue('6.000.000-K');
    fireEvent.change(rut, { target: { value: '123456785' } });
    rut.setSelectionRange(3, 3);
    fireEvent.keyDown(rut, { key: 'Backspace' });
    expect(rut).toHaveValue('1.345.678-5');
    expect(rut.selectionStart).toBe(1);
  });

  it('rejects an incorrect verifier, focuses the field and keeps the entered name', () => {
    mount();
    fillName();
    const rut = screen.getByRole('textbox', { name: 'RUN / RUT' });
    fireEvent.change(rut, { target: { value: '123456789' } });
    submit();
    expect(rut).toHaveFocus();
    expect(rut).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Revisa el RUN\/RUT completo/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nombre completo' })).toHaveValue('Ana Pérez');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('registers a client without optional data', async () => {
    mount();
    fillName();
    submit();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/clients',
        expect.objectContaining({ nombre: 'Ana Pérez', rut: null, email: null, telefono: null }),
      ),
    );
  });

  it('shows duplicate errors on the RUT and permits correcting and retrying', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { error: { message: 'Ya existe un cliente con ese RUT' } } },
    });
    mount();
    fillName();
    const rut = screen.getByRole('textbox', { name: 'RUN / RUT' });
    fireEvent.change(rut, { target: { value: '123456785' } });
    submit();
    expect(await screen.findByText(/Ya existe un cliente con este RUN\/RUT/)).toBeInTheDocument();
    expect(rut).toHaveFocus();
    fireEvent.change(rut, { target: { value: '6000000k' } });
    expect(screen.queryByText(/Ya existe un cliente con este RUN\/RUT/)).not.toBeInTheDocument();
    submit();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  });

  it('opens additional details and focuses a field rejected by the API', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            message: 'Error de validación',
            details: [{ field: 'comuna', message: 'Comuna no válida' }],
          },
        },
      },
    });
    mount();
    fillName();
    submit();
    expect(await screen.findByText('Comuna no válida')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dirección y notas' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('combobox', { name: 'Comuna' })).toHaveFocus();
  });

  it('blocks closing and repeated submission while saving', async () => {
    let finish: (value: AxiosResponse) => void = () => {};
    vi.mocked(api.post).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { onClose } = mount();
    fillName();
    submit();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar formulario de cliente' }));
    expect(onClose).not.toHaveBeenCalled();
    finish({ data: { client: savedClient } } as AxiosResponse);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.post).toHaveBeenCalledOnce();
  });

  it('updates only changed fields without rejecting unrelated legacy data', async () => {
    mount({ ...savedClient, rut: '123456789', telefono: '12345' });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre completo' }), {
      target: { value: 'Ana Pérez Actualizada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/clients/7', { nombre: 'Ana Pérez Actualizada' }),
    );
  });

  it('changes to a company without losing contact details', () => {
    mount();
    fillName();
    fireEvent.change(screen.getByRole('textbox', { name: 'RUN / RUT' }), {
      target: { value: '123456785' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Empresa' }));
    expect(screen.getByRole('textbox', { name: 'Razón social' })).toHaveValue('Ana Pérez');
    expect(screen.getByRole('textbox', { name: 'RUT de la empresa' })).toHaveValue('12.345.678-5');
  });

  it('filters communes by region, searches without accents and saves their official names', async () => {
    mount();
    fillName();
    fireEvent.click(screen.getByRole('button', { name: 'Dirección y notas' }));
    const region = screen.getByRole('combobox', { name: 'Región' });
    const commune = screen.getByRole('combobox', { name: 'Comuna' });
    fireEvent.focus(region);
    fireEvent.change(region, { target: { value: 'nuble' } });
    fireEvent.click(screen.getByRole('option', { name: 'Región de Ñuble' }));
    fireEvent.focus(commune);
    expect(screen.queryByRole('option', { name: 'Antofagasta' })).not.toBeInTheDocument();
    fireEvent.change(commune, { target: { value: 'chillan viejo' } });
    fireEvent.keyDown(commune, { key: 'Enter' });
    expect(commune).toHaveValue('Chillán Viejo');
    submit();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/clients',
        expect.objectContaining({ region: 'Región de Ñuble', comuna: 'Chillán Viejo' }),
      ),
    );
  });

  it('automatically selects the region when searching a commune first', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Dirección y notas' }));
    const commune = screen.getByRole('combobox', { name: 'Comuna' });
    fireEvent.focus(commune);
    fireEvent.change(commune, { target: { value: 'punta arenas' } });
    fireEvent.keyDown(commune, { key: 'Enter' });
    expect(commune).toHaveValue('Punta Arenas');
    expect(screen.getByRole('combobox', { name: 'Región' })).toHaveValue(
      'Región de Magallanes y Antártica Chilena',
    );
  });

  it('clears an incompatible commune after changing or clearing the region', () => {
    mount({ ...savedClient, region: 'Metropolitana', comuna: 'Santiago' });
    fireEvent.click(screen.getByRole('button', { name: 'Dirección y notas' }));
    const region = screen.getByRole('combobox', { name: 'Región' });
    const commune = screen.getByRole('combobox', { name: 'Comuna' });
    fireEvent.focus(region);
    fireEvent.change(region, { target: { value: 'antofagasta' } });
    fireEvent.keyDown(region, { key: 'Enter' });
    expect(commune).toHaveValue('');
    fireEvent.focus(commune);
    fireEvent.change(commune, { target: { value: 'calama' } });
    fireEvent.keyDown(commune, { key: 'Enter' });
    expect(commune).toHaveValue('Calama');
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar región' }));
    expect(region).toHaveValue('');
    expect(commune).toHaveValue('');
  });

  it('recognizes legacy region names and preserves the saved location when editing another field', async () => {
    mount({ ...savedClient, region: 'Metropolitana', comuna: 'Santiago' });
    fireEvent.click(screen.getByRole('button', { name: 'Dirección y notas' }));
    const commune = screen.getByRole('combobox', { name: 'Comuna' });
    fireEvent.focus(commune);
    expect(screen.getAllByRole('option')).toHaveLength(52);
    fireEvent.keyDown(commune, { key: 'Escape' });
    expect(commune).toHaveValue('Santiago');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre completo' }), {
      target: { value: 'Ana Actualizada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/clients/7', { nombre: 'Ana Actualizada' }),
    );
  });

  it('shows empty search results and Escape closes only the dropdown', () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Dirección y notas' }));
    const region = screen.getByRole('combobox', { name: 'Región' });
    fireEvent.focus(region);
    fireEvent.change(region, { target: { value: 'no existe' } });
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
