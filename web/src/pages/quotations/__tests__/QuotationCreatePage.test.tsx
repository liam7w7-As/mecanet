import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import QuotationCreatePage from '../QuotationCreatePage';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const client = { id: 7, nombre: 'Cliente Repuestos', rut: '123456785', tipo: 'cliente', vehiclesCount: 1 };
const vehicle = { id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Corolla', ano: 2020, client };

const renderCreate = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <MemoryRouter initialEntries={['/quotations/new']}>
      <Routes>
        <Route path="/quotations/new" element={<QuotationCreatePage />} />
        <Route path="/quotations/:id" element={<p>Cotización guardada</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

const selectClient = async () => {
  const input = screen.getByRole('combobox', { name: 'Buscar cliente' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Cliente' } });
  fireEvent.click(await screen.findByRole('button', { name: /Cliente Repuestos/ }));
};

const selectPart = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Repuestos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar Filtro de aceite' }));
};

describe('QuotationCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/search/quick') return Promise.resolve({ data: { clients: [client], vehicles: [vehicle] } });
      if (url === '/catalog') return Promise.resolve({ data: {
        items: [{ id: 9, nombre: 'Filtro de aceite', tipo: 'parte', codigo: 'FIL-01', stock: 10, unidadMedida: 'unidad', precio: 5000 }],
        total: 1, totalPages: 1, page: 1, pageSize: 12,
      } });
      return Promise.reject(new Error(`Ruta inesperada: ${url}`));
    });
    vi.mocked(api.post).mockResolvedValue({ data: { quotation: { id: 99 } } });
  });

  it('crea una cotización de repuestos con cliente, sin solicitar vehículo ni origen OT', async () => {
    renderCreate();
    expect(screen.queryByText('Origen de la cotización')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Vincular a OT' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Buscar vehículo' })).not.toBeInTheDocument();
    await selectClient();
    expect(screen.queryByRole('button', { name: /ABCD12/ })).not.toBeInTheDocument();
    await selectPart();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }));
    expect(await screen.findByText('Cotización guardada')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/quotations', expect.objectContaining({
      clientId: 7, vehicleId: null,
      items: [expect.objectContaining({ catalogItemId: 9, tipoLinea: 'parte', precioUnitario: 5000 })],
    }));
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).not.toHaveProperty('workOrderId');
    expect(vi.mocked(api.get).mock.calls.some(([url]) => String(url).startsWith('/work-orders'))).toBe(false);
  });

  it('permite asociar un vehículo opcional sin vincular una OT', async () => {
    renderCreate();
    await selectClient();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Asociar vehículo (opcional)' }));
    const input = screen.getByRole('combobox', { name: 'Buscar vehículo' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ABCD12' } });
    fireEvent.click(await screen.findByRole('button', { name: /^ABCD12/ }));
    await selectPart();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quotations', expect.objectContaining({ clientId: 7, vehicleId: 4 })));
  });

  it('elimina el vehículo del envío al desmarcar la asociación opcional', async () => {
    renderCreate();
    await selectClient();
    const toggle = screen.getByRole('checkbox', { name: 'Asociar vehículo (opcional)' });
    fireEvent.click(toggle);
    const input = screen.getByRole('combobox', { name: 'Buscar vehículo' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ABCD12' } });
    fireEvent.click(await screen.findByRole('button', { name: /^ABCD12/ }));
    fireEvent.click(toggle);
    await selectPart();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quotations', expect.objectContaining({ clientId: 7, vehicleId: null })));
  });

  it('pide seleccionar un cliente si no hay destinatario, sin exigir OT ni vehículo', async () => {
    renderCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seleccione un cliente');
    expect(api.post).not.toHaveBeenCalled();
  });
});
