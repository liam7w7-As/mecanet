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
const newClient = {
  id: 71,
  nombre: 'Cliente Nuevo',
  rut: null,
  tipo: 'cliente',
  email: null,
  telefono: null,
  direccion: null,
  region: null,
  comuna: null,
  notas: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

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
    expect(await screen.findByRole('dialog', { name: 'Confirmar emisión' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear' }));
    expect(await screen.findByText('Cotización guardada')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/quotations', expect.objectContaining({
      clientId: 7, vehicleId: null,
      items: [expect.objectContaining({ catalogItemId: 9, tipoLinea: 'parte', precioUnitario: 5000 })],
    }));
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).not.toHaveProperty('workOrderId');
    expect(vi.mocked(api.get).mock.calls.some(([url]) => String(url).startsWith('/work-orders'))).toBe(false);
  });

  it('permite crear un cliente desde el buscador con el formulario rápido', async () => {
    vi.mocked(api.post).mockImplementation((url) => {
      if (url === '/clients') return Promise.resolve({ data: { client: newClient } });
      return Promise.resolve({ data: { quotation: { id: 99 } } });
    });
    renderCreate();
    const input = screen.getByRole('combobox', { name: 'Buscar cliente' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Cliente Nuevo' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Crear cliente «Cliente Nuevo»' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo cliente' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nombre completo' })).toHaveValue('Cliente Nuevo');
    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/clients',
        expect.objectContaining({ nombre: 'Cliente Nuevo', tipo: 'cliente' }),
      ),
    );
    expect(await screen.findByText('Cliente Nuevo')).toBeInTheDocument();
    await selectPart();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }));
    expect(await screen.findByRole('dialog', { name: 'Confirmar emisión' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/quotations',
        expect.objectContaining({ clientId: 71, vehicleId: null }),
      ),
    );
    expect(await screen.findByText('Cotización guardada')).toBeInTheDocument();
  });

  it('precarga el RUN/RUT en el formulario cuando lo escrito tiene formato de RUT', async () => {
    renderCreate();
    const input = screen.getByRole('combobox', { name: 'Buscar cliente' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12.232.378-8' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Crear cliente «12.232.378-8»' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo cliente' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'RUN / RUT' })).toHaveValue('12.232.378-8');
    expect(screen.getByRole('textbox', { name: 'Nombre completo' })).toHaveValue('');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('no ofrece crear cliente cuando el nombre escrito ya está registrado', async () => {
    renderCreate();
    const input = screen.getByRole('combobox', { name: 'Buscar cliente' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Cliente Repuestos' } });
    await screen.findByRole('button', { name: /Cliente Repuestos/ });
    expect(screen.queryByRole('button', { name: /Crear cliente/ })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('pide seleccionar un cliente si no hay destinatario, sin exigir OT ni vehículo', async () => {
    renderCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seleccione un cliente');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('oculta avance y guarda condiciones con descuentos por línea y general', async () => {
    renderCreate();
    expect(screen.queryByRole('combobox', { name: 'Avance 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Validez (días)' })).toHaveValue(5);
    await selectClient();
    await selectPart();
    fireEvent.change(screen.getByLabelText('Disponibilidad del trabajo'), { target: { value: 'En 48 horas' } });
    fireEvent.change(screen.getByLabelText('Validez (días)'), { target: { value: '10' } });
    fireEvent.click(screen.getByLabelText('Descuento por línea'));
    fireEvent.change(screen.getByLabelText('Tipo de descuento 1'), { target: { value: 'porcentaje' } });
    fireEvent.change(screen.getByLabelText('Descuento 1'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Tipo de descuento general'), { target: { value: 'fijo' } });
    fireEvent.change(screen.getByLabelText('Descuento general'), { target: { value: '500' } });
    // Al reemplazar el placeholder la fila vieja sale con animación: se espera
    // a que quede una sola antes de leer subtotales.
    await waitFor(() => expect(screen.getAllByTestId('item-subtotal-0')).toHaveLength(1));
    expect(screen.getByTestId('item-subtotal-0')).toHaveTextContent('$4.500');
    expect(screen.getByTestId('quotation-total')).toHaveTextContent('$4.000');
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }));
    expect(await screen.findByRole('dialog', { name: 'Confirmar emisión' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear' }));
    await screen.findByText('Cotización guardada');
    expect(api.post).toHaveBeenCalledWith('/quotations', expect.objectContaining({
      formaPago: 'transferencia', disponibilidadTrabajo: 'En 48 horas', validezDias: 10,
      descuentoTipo: 'fijo', descuentoValor: 500,
      items: [expect.objectContaining({ descuentoTipo: 'porcentaje', descuentoValor: 10, estadoOperativo: 'pendiente' })],
    }));
  });

  it('no envía descuentos mayores al importe de una línea', async () => {
    renderCreate();
    await selectClient();
    await selectPart();
    fireEvent.click(screen.getByLabelText('Descuento por línea'));
    fireEvent.change(screen.getByLabelText('Tipo de descuento 1'), { target: { value: 'fijo' } });
    fireEvent.change(screen.getByLabelText('Descuento 1'), { target: { value: '6000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('descuento no puede superar'))).toBe(true);
  });
});
