import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import CatalogPage from '../CatalogPage';

import type {
  CatalogItem,
  PaginatedResponse,
  StockBalance,
  StockMovement,
  Warehouse,
} from '../../../types/entities';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const serviceItem: CatalogItem = {
  id: 1,
  tipo: 'estandar',
  codigo: 'SRV-001',
  nombre: 'Cambio de aceite',
  descripcion: 'Servicio preventivo',
  unidadMedida: 'servicio',
  precio: 35000,
  stock: 0,
  stockMinimo: 0,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

const partItem: CatalogItem = {
  id: 2,
  tipo: 'parte',
  codigo: 'REP-002',
  nombre: 'Filtro de aceite',
  descripcion: 'Filtro de motor',
  unidadMedida: 'unidad',
  precio: 12000,
  stock: 3,
  stockMinimo: 2,
  createdAt: '2026-09-15T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

const warehouse: Warehouse = {
  id: 1,
  codigo: 'CENTRAL',
  nombre: 'Bodega Central',
  direccion: null,
  activo: true,
  totalItems: 1,
  totalUnidades: 3,
};

const balance: StockBalance = {
  warehouseId: 1,
  catalogItemId: 2,
  cantidad: 3,
  codigo: 'REP-002',
  nombre: 'Filtro de aceite',
  precio: 12000,
  stockMinimo: 2,
  bajoMinimo: false,
};

const movement: StockMovement = {
  id: 10,
  catalogItemId: 2,
  warehouseId: 1,
  tipo: 'ingreso',
  cantidad: 5,
  saldoResultante: 8,
  motivo: 'Recepción proveedor',
  referencia: null,
  createdBy: 1,
  fecha: '2026-09-26T10:00:00.000Z',
  codigo: 'REP-002',
  nombre: 'Filtro de aceite',
  warehouseCodigo: 'CENTRAL',
  warehouseNombre: 'Bodega Central',
};

let catalogResponse: PaginatedResponse<CatalogItem>;

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('CatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogResponse = {
      items: [serviceItem, partItem],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    };
    useAuthStore.setState({
      user: {
        id: 1,
        nombre: 'Desarrollador UNITHOR',
        email: 'dev@unithor.local',
        role: 'desarrollador',
      },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/catalog') {
        return Promise.resolve({
          data: catalogResponse,
        } as AxiosResponse<PaginatedResponse<CatalogItem>>);
      }
      if (url === '/warehouses') {
        return Promise.resolve({
          data: {
            items: [warehouse],
            total: 1,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          },
        } as AxiosResponse<PaginatedResponse<Warehouse>>);
      }
      if (url === '/warehouses/1/balances') {
        return Promise.resolve({
          data: { balances: [balance] },
        } as AxiosResponse<{ balances: StockBalance[] }>);
      }
      if (url === '/warehouses/movements/all') {
        return Promise.resolve({
          data: { items: [movement], total: 1, page: 1, pageSize: 12, totalPages: 1 },
        } as AxiosResponse<PaginatedResponse<StockMovement>>);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
  });

  it('renderiza el listado y las tabs de navegación', async () => {
    renderPage();

    expect(await screen.findByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.getByText('Filtro de aceite')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Servicios Estándar' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Repuestos / Partes' })).toBeInTheDocument();
    expect(screen.getByText('Crítico · 3')).toBeInTheDocument();
  });

  it('muestra el filtro de disponibilidad al seleccionar Repuestos', async () => {
    renderPage();
    await screen.findByText('Cambio de aceite');

    fireEvent.click(screen.getByRole('tab', { name: 'Repuestos / Partes' }));
    const stockFilter = screen.getByRole('checkbox', { name: 'Solo con stock disponible' });
    fireEvent.click(stockFilter);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/catalog', {
        params: expect.objectContaining({ tipo: 'parte', soloConStock: true }),
      });
    });
  });

  it('deshabilita stock al crear un Servicio Estándar', async () => {
    renderPage();
    await screen.findByText('Cambio de aceite');

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Servicio estándar' }));

    expect(screen.getByLabelText('Stock inicial')).toBeDisabled();
  });

  it('bloquea un egreso superior al stock disponible', async () => {
    renderPage();
    await screen.findByText('Filtro de aceite');

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar stock de Filtro de aceite' }));
    await waitFor(() => expect(screen.getByLabelText('Almacén')).toBeEnabled());
    await waitFor(() => expect(screen.getByTestId('current-stock')).toHaveTextContent('3'));
    fireEvent.click(screen.getByRole('button', { name: 'Salida' }));
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Entrega a taller' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar movimiento' }));

    expect(
      await screen.findByText(
        'La salida no puede superar las 3 unidades disponibles en esta bodega',
      ),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('actualiza la fila después de un ajuste exitoso sin recargar la página', async () => {
    vi.mocked(api.post).mockImplementation(async () => {
      const updatedItem = { ...partItem, stock: 8 };
      catalogResponse = { ...catalogResponse, items: [serviceItem, updatedItem] };
      return { data: { movement } } as AxiosResponse<{ movement: StockMovement }>;
    });
    renderPage();
    await screen.findByText('Filtro de aceite');

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar stock de Filtro de aceite' }));
    await waitFor(() => expect(screen.getByLabelText('Almacén')).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Recepción proveedor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar movimiento' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/warehouses/movements', {
        catalogItemId: 2,
        warehouseId: 1,
        tipo: 'ingreso',
        cantidad: 5,
        motivo: 'Recepción proveedor',
      }),
    );
    await waitFor(() => expect(screen.getByTestId('stock-2')).toHaveTextContent('8 unidades'));
    expect(screen.queryByRole('dialog', { name: 'Filtro de aceite' })).not.toBeInTheDocument();
  });

  it('abre el detalle del item con existencias y kardex', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle de Filtro de aceite' }));

    expect(await screen.findByRole('dialog', { name: 'Filtro de aceite' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Existencias' }));
    expect(await screen.findByText('Bodega Central')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kardex' }));
    expect(await screen.findByText('Ingreso · Recepción proveedor')).toBeInTheDocument();
  });
});
