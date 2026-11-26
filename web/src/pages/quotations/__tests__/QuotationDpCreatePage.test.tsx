import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { calculateDpWorkQuote, createDefaultDpConfiguration, dpQuoteInputSchema } from '@unithor/shared';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getNavigationGroups } from '../../../components/layout/navigation';
import { api } from '../../../lib/api';
import { APP_ROUTES, hasRouteAccess } from '../../../lib/route-access';
import { useAuthStore } from '../../../stores/auth.store';
import QuotationDpCreatePage from '../QuotationDpCreatePage';

import type { CatalogItem, PaginatedResponse, QuickSearchClient, QuickSearchVehicle } from '../../../types/entities';
import type { DpConfigurationRecord } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const client: QuickSearchClient = {
  id: 7,
  nombre: 'Transportes D&P',
  rut: '76123456-7',
  tipo: 'empresa',
  telefono: '+56912345678',
  email: 'dp@cliente.cl',
  vehiclesCount: 1,
};

const vehicle: QuickSearchVehicle = {
  id: 21,
  patente: 'ABCD12',
  marca: 'Toyota',
  modelo: 'RAV4',
  ano: 2023,
  dpBodyTypeId: 'suv',
  dpSizeId: 'L',
  client: { id: 7, nombre: 'Transportes D&P', rut: '76123456-7' },
};

const accPart: CatalogItem = {
  id: 50,
  tipo: 'parte',
  division: 'ACC',
  subtipo: 'a_pedido',
  codigo: 'REP-50',
  nombre: 'Manilla puerta delantera',
  descripcion: 'Original',
  unidadMedida: 'unidad',
  precio: 45000,
  horasHombreEstandar: null,
  stock: 0,
  stockMinimo: 0,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
};

const dpRecord = (): DpConfigurationRecord => ({
  revision: 2,
  configuration: createDefaultDpConfiguration(),
  updatedAt: '2026-11-24T10:00:00.000Z',
  lastEditor: null,
});

function renderPage() {
  const clientQuery = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={clientQuery}>
      <MemoryRouter initialEntries={['/quotations/new-dp']}>
        <Routes>
          <Route path="/quotations/new-dp" element={<QuotationDpCreatePage />} />
          <Route path="/quotations/:id" element={<div>Detalle COT</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Cotización D&P (módulo dedicado y sidebar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 3,
        nombre: 'Asesor Comercial',
        email: 'comercial@unithor.cl',
        role: 'vendedor',
        permissions: [
          { modulo: 'comercial', accion: 'read' },
          { modulo: 'comercial', accion: 'create' },
          { modulo: 'taller', accion: 'read' },
        ],
      },
      isAuthenticated: true,
      isLoading: false,
    });

    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/catalog/dp') {
        return Promise.resolve({ data: dpRecord() } as AxiosResponse);
      }
      if (url === '/search/quick') {
        return Promise.resolve({
          data: { clients: [client], vehicles: [vehicle] },
        } as AxiosResponse);
      }
      if (url === '/clients') {
        return Promise.resolve({
          data: { items: [client], total: 1, page: 1, pageSize: 8, totalPages: 1 },
        } as AxiosResponse);
      }
      if (url === '/vehicles') {
        return Promise.resolve({
          data: { items: [vehicle], total: 1, page: 1, pageSize: 8, totalPages: 1 },
        } as AxiosResponse);
      }
      if (url === '/catalog') {
        return Promise.resolve({
          data: { items: [accPart], total: 1, page: 1, pageSize: 8, totalPages: 1 },
        } as AxiosResponse<PaginatedResponse<CatalogItem>>);
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });

    vi.mocked(api.post).mockImplementation(async (url, raw) => {
      if (url === '/catalog/dp/quote') {
        return {
          data: { quote: calculateDpWorkQuote(dpRecord().configuration, dpQuoteInputSchema.parse(raw), 2) },
        } as AxiosResponse;
      }
      if (url === '/quotations') {
        return { data: { quotation: { id: 99, codigo: 'COT-2026-0099' } } } as AxiosResponse;
      }
      return Promise.reject(new Error(`POST inesperado: ${url}`));
    });
  });

  it('expone Cotización D&P en el sidebar para comercial:create y respeta permisos', () => {
    const vendedorNav = getNavigationGroups(useAuthStore.getState().user);
    const comercialGroup = vendedorNav.find((g) => g.heading === 'Comercial');
    expect(comercialGroup?.items.some((i) => i.label === 'Cotización D&P' && i.path === '/quotations/new-dp')).toBe(true);

    const sinPermiso = {
      id: 9,
      nombre: 'Bodega',
      email: 'b@unithor.cl',
      role: 'bodeguero' as const,
      permissions: [{ modulo: 'almacen' as const, accion: 'read' as const }],
    };
    expect(hasRouteAccess(sinPermiso, APP_ROUTES.quotationDpCreate)).toBe(false);
    expect(getNavigationGroups(sinPermiso).flatMap((g) => g.items).some((i) => i.path === '/quotations/new-dp')).toBe(false);
  });

  it('cotiza D&P sin patente usando el mapa interactivo de piezas + repuesto ACC', async () => {
    renderPage();
    expect(await screen.findByTestId('quotation-dp-page')).toBeInTheDocument();

    // Elegir cliente
    const clientInput = screen.getByPlaceholderText(/Buscar cliente/i);
    fireEvent.focus(clientInput);
    fireEvent.change(clientInput, { target: { value: 'Transportes' } });
    fireEvent.click(await screen.findByRole('button', { name: /Transportes D&P/ }));

    // Elegir carrocería SUV, tamaño L y referencia sin patente
    fireEvent.click(screen.getByRole('button', { name: 'SUV' }));
    fireEvent.click(screen.getByRole('button', { name: /L \(1[,.]15\)/i }));
    fireEvent.change(screen.getByLabelText('Referencia del vehículo'), { target: { value: 'Toyota RAV4' } });

    // Seleccionar puerta delantera izquierda desde el mapa visual SVG
    const svgMap = screen.getByRole('group', { name: 'Diagrama interactivo del vehículo' });
    fireEvent.click(within(svgMap).getByRole('button', { name: 'Puerta · Delantera izquierda' }));

    // Marcar Desabolladura + Daño D2 + Pintura completa
    fireEvent.click(screen.getByRole('button', { name: 'Desabolladura' }));
    fireEvent.click(screen.getByRole('button', { name: /D2/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pintura completa de la pieza' }));

    // Agregar pieza al presupuesto
    fireEvent.click(screen.getByRole('button', { name: 'Agregar pieza' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/catalog/dp/quote', expect.objectContaining({
      bodyTypeId: 'suv',
      sizeId: 'L',
      pieceId: 'puerta',
      positionId: 'FL',
      damageLevelId: 'D2',
    })));

    // Vincular repuesto ACC a pedido
    fireEvent.click(screen.getByRole('tab', { name: 'Repuestos ACC' }));
    await screen.findByText('Manilla puerta delantera');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // Emitir cotización D&P sin vehicleId
    fireEvent.click(screen.getByRole('button', { name: 'Emitir Cotización D&P' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quotations', expect.objectContaining({
      clientId: 7,
      vehicleId: null,
      dpBodyTypeId: 'suv',
      dpSizeId: 'L',
      dpVehicleRef: 'Toyota RAV4',
      items: expect.arrayContaining([
        expect.objectContaining({ division: 'DP', subtipo: 'servicio_dp' }),
        expect.objectContaining({ division: 'ACC', subtipo: 'a_pedido', catalogItemId: 50 }),
      ]),
    })));
    expect(await screen.findByText('Detalle COT')).toBeInTheDocument();
  });

  it('permite cotizar D&P con vehículo registrado por patente', async () => {
    renderPage();
    await screen.findByTestId('quotation-dp-page');

    const clientInput = screen.getByPlaceholderText(/Buscar cliente/i);
    fireEvent.focus(clientInput);
    fireEvent.change(clientInput, { target: { value: 'Transportes' } });
    fireEvent.click(await screen.findByRole('button', { name: /Transportes D&P/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Con patente' }));
    const plateInput = screen.getByPlaceholderText(/Buscar patente/i);
    fireEvent.focus(plateInput);
    fireEvent.change(plateInput, { target: { value: 'ABCD' } });
    fireEvent.click(await screen.findByRole('button', { name: /ABCD-12/ }));

    const svgMap = screen.getByRole('group', { name: 'Diagrama interactivo del vehículo' });
    fireEvent.click(within(svgMap).getByRole('button', { name: 'Capó · Única' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pintura completa de la pieza' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar pieza' }));
    await screen.findByText('Presupuesto (1)');

    fireEvent.click(screen.getByRole('button', { name: 'Emitir Cotización D&P' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/quotations', expect.objectContaining({
      clientId: 7,
      vehicleId: 21,
      dpBodyTypeId: 'suv',
      dpSizeId: 'L',
    })));
  });
});
