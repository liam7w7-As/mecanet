import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { calculateDpWorkQuote, createDefaultDpConfiguration, dpQuoteInputSchema } from '@unithor/shared';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getNavigationGroups } from '../../../components/layout/navigation';
import { api } from '../../../lib/api';
import { dpQuotationRecoverySchema } from '../../../lib/dp-quotation-recovery';
import * as formRecovery from '../../../lib/form-recovery';
import { quotationRecoverySchema } from '../../../lib/form-recovery.schemas';
import { APP_ROUTES, hasRouteAccess } from '../../../lib/route-access';
import { useAuthStore } from '../../../stores/auth.store';
import QuotationDpCreatePage from '../QuotationDpCreatePage';

import type { DpQuotationLine, DpQuotationRecovery } from '../../../lib/dp-quotation-recovery';
import type { CatalogItem, PaginatedResponse, QuickSearchClient, QuickSearchVehicle } from '../../../types/entities';
import type { DpConfigurationRecord, DpQuoteInput } from '@unithor/shared';
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

function QuotationDetail() {
  const { id } = useParams();
  return <div><span>Detalle COT</span><output data-testid="quotation-detail-id">{id}</output></div>;
}

const queryClients = new Set<QueryClient>();

function renderPage() {
  const clientQuery = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClients.add(clientQuery);
  return render(
    <QueryClientProvider client={clientQuery}>
      <MemoryRouter initialEntries={['/quotations/new-dp']}>
        <Routes>
          <Route path="/quotations/new-dp" element={<QuotationDpCreatePage />} />
          <Route path="/quotations/:id" element={<QuotationDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function draftLine(patch: Partial<DpQuoteInput> = {}, discount = '0'): DpQuotationLine {
  const quote = calculateDpWorkQuote(dpRecord().configuration, dpQuoteInputSchema.parse({
    configurationRevision: 2, bodyTypeId: 'hatchback', sizeId: 'M', pieceId: 'retrovisor', positionId: 'L',
    operations: [{ operationId: 'painting_full' }], ...patch,
  }), 2);
  return {
    key: crypto.randomUUID(), division: 'DP', subtipo: 'servicio_dp', tipoLinea: 'estandar', catalogItemId: null,
    descripcion: `${quote.pieceLabel} · ${quote.positionLabel}`, unidadMedida: 'unidad', cantidad: '1',
    precioUnitario: String(quote.precioUnitario), descuentoTipo: discount === '0' ? null : 'fijo', descuentoValor: discount,
    dpPricing: quote.selection, dpPricingSnapshot: quote,
  };
}

function recoveryDraft(patch: Partial<DpQuotationRecovery> = {}): DpQuotationRecovery {
  return {
    client: { id: client.id, nombre: client.nombre, rut: client.rut }, vehicleMode: 'no_plate', selectedVehicle: null,
    bodyTypeId: 'hatchback', sizeId: 'M', vehicleRef: 'Referencia recuperada', items: [draftLine()],
    commercial: { formaPago: 'transferencia', disponibilidadTrabajo: '', validezDias: '5', descuentoTipo: null, descuentoValor: '0' },
    notas: '', workspaceMode: 'piece', selectedPieceKey: null, editingLineKey: null, opIds: [], damageLevelId: '',
    pieceDiscountType: null, pieceDiscountValue: '', accSearch: '', accSubtype: 'all', createdQuotationId: null,
    ...patch,
  };
}

const readDraft = () => formRecovery.loadFormDraft(3, 'quotation:dp:new', dpQuotationRecoverySchema);
const flushDrafts = () => act(async () => { await formRecovery.flushFormDrafts(); });

async function recoverDraft(draft: DpQuotationRecovery) {
  await flushDrafts();
  await formRecovery.saveFormDraft(3, 'quotation:dp:new', dpQuotationRecoverySchema.parse(draft), crypto.randomUUID());
  expect(await readDraft()).not.toBeNull();
  const page = renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeEnabled());
  return page;
}

describe('Cotización D&P (módulo dedicado y sidebar)', () => {
  afterEach(async () => {
    cleanup();
    for (const queryClient of queryClients) queryClient.clear();
    queryClients.clear();
    // Settle recovery effects before the next case receives its own IndexedDB.
    await flushDrafts();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
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

  it('busca por ubicación, abre el editor y vuelve al mapa sin perder la selección', async () => {
    renderPage();
    const search = await screen.findByRole('searchbox', { name: 'Buscar pieza o ubicación' });
    await waitFor(() => expect(search).toBeEnabled());
    fireEvent.change(search, { target: { value: 'delantera izquierda puerta' } });
    const results = screen.getByRole('group', { name: 'Piezas disponibles' });
    const door = within(results).getByRole('button', { name: 'Puerta · Delantera izquierda' });
    expect(within(results).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(door);
    const editor = screen.getByRole('region', { name: 'Configurar Puerta · Delantera izquierda' });
    expect(editor).toHaveFocus();
    const paint = within(editor).getByRole('button', { name: 'Pintura completa de la pieza' });
    fireEvent.click(paint);
    fireEvent.click(within(editor).getByRole('button', { name: 'Volver al mapa' }));
    fireEvent.click(door);
    expect(paint).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(editor).getByRole('button', { name: 'Agregar pieza' }));
    await screen.findByText(/Puerta · Delantera izquierda: agregado al presupuesto/);
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cotizadas (1)' }));
    expect(within(results).getAllByRole('button')).toHaveLength(1);
    const summary = screen.getByRole('button', { name: /Ver presupuesto/ });
    expect(summary).toHaveTextContent(screen.getByTestId('dp-quotation-total').textContent ?? '');
    fireEvent.click(summary);
    expect(screen.getByRole('heading', { name: 'Presupuesto (1)' })).toHaveFocus();
  });

  it('cotiza D&P sin patente usando el mapa interactivo de piezas + repuesto ACC', async () => {
    renderPage();
    expect(await screen.findByTestId('quotation-dp-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeEnabled());

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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeEnabled());

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

  it('persiste y recupera filas, descuentos y el editor sin guardar después de recargar, sin emitir automáticamente', async () => {
    const first = renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeEnabled());
    const clientInput = screen.getByPlaceholderText(/Buscar cliente/i);
    fireEvent.focus(clientInput);
    fireEvent.change(clientInput, { target: { value: 'Transportes' } });
    fireEvent.click(await screen.findByRole('button', { name: /Transportes D&P/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pickup' }));
    fireEvent.change(screen.getByLabelText('Referencia del vehículo'), { target: { value: 'Camioneta azul' } });
    const map = screen.getByRole('group', { name: 'Diagrama interactivo del vehículo' });
    fireEvent.click(within(map).getByRole('button', { name: 'Retrovisor · Izquierda' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pintura completa de la pieza' }));
    fireEvent.change(screen.getByLabelText('Tipo descuento pieza'), { target: { value: 'porcentaje' } });
    fireEvent.change(screen.getByLabelText('Valor descuento pieza'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar pieza' }));
    await screen.findByText('Presupuesto (1)');
    fireEvent.click(screen.getByRole('button', { name: /Editar Retrovisor/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Desabolladura' }));
    fireEvent.click(screen.getByRole('button', { name: /D2/i }));
    fireEvent.change(screen.getByLabelText('Valor descuento pieza'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Tipo de descuento general'), { target: { value: 'fijo' } });
    fireEvent.change(screen.getByLabelText('Descuento general'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Disponibilidad del trabajo'), { target: { value: 'El lunes' } });
    fireEvent.change(screen.getByLabelText('Validez (días)'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Notas (opcional)'), { target: { value: 'Igualar color' } });
    await flushDrafts();
    const saved = (await readDraft())!;
    expect(saved.payload.items[0]).toMatchObject({ descuentoTipo: 'porcentaje', descuentoValor: '10', dpPricing: { bodyTypeId: 'pickup' } });
    expect(saved.payload.editingLineKey).toBe(saved.payload.items[0].key);
    first.unmount();

    renderPage();
    await screen.findByRole('button', { name: 'Recuperar formulario' });
    expect(screen.getByLabelText('Referencia del vehículo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeDisabled();
    const pendingMap = screen.getByRole('group', { name: 'Diagrama interactivo del vehículo' });
    const pendingPiece = within(pendingMap).getByRole('button', { name: 'Capó · Única' });
    fireEvent.click(pendingPiece);
    fireEvent.keyDown(pendingPiece, { key: 'Enter' });
    expect(screen.queryByLabelText('Tipo descuento pieza')).not.toBeInTheDocument();
    await flushDrafts();
    expect((await readDraft())!.payload).toEqual(saved.payload);
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByText(client.nombre)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pickup' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Referencia del vehículo')).toHaveValue('Camioneta azul');
    expect(screen.getByLabelText('Disponibilidad del trabajo')).toHaveValue('El lunes');
    expect(screen.getByLabelText('Validez (días)')).toHaveValue(8);
    expect(screen.getByLabelText('Notas (opcional)')).toHaveValue('Igualar color');
    expect(screen.getByLabelText('Descuento general')).toHaveValue('500');
    expect(screen.getByRole('button', { name: 'Actualizar pieza' })).toBeEnabled();
    expect(screen.getByLabelText('Valor descuento pieza')).toHaveValue(20);
    expect(screen.getByRole('button', { name: /D2/i })).toHaveAttribute('aria-pressed', 'true');
    expect(api.post).toHaveBeenCalledTimes(1); // Only the explicit piece validation before reload.
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar pieza' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Actualizar pieza' })).not.toBeInTheDocument());
    expect(screen.getByText('Presupuesto (1)')).toBeInTheDocument();
    await flushDrafts();
    expect((await readDraft())!.payload.items[0]).toMatchObject({ descuentoValor: '20', dpPricing: { damageLevelId: 'D2' } });
  });

  it('recupera el vehículo registrado y el workspace ACC con sus filtros', async () => {
    const page = await recoverDraft(recoveryDraft({ vehicleMode: 'registered', selectedVehicle: vehicle, bodyTypeId: 'suv', sizeId: 'L', items: [] }));
    fireEvent.click(screen.getByRole('tab', { name: 'Repuestos ACC' }));
    fireEvent.change(screen.getByLabelText('Buscar repuesto ACC'), { target: { value: 'Manilla' } });
    fireEvent.click(screen.getByRole('button', { name: 'A pedido' }));
    await flushDrafts();
    page.unmount();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Con patente' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: 'Repuestos ACC' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Buscar repuesto ACC')).toHaveValue('Manilla');
    await flushDrafts();
    expect((await readDraft())!.payload.accSubtype).toBe('a_pedido');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('confirma el descarte y conserva las capturas de otros usuarios y de cotización ordinaria', async () => {
    const draft = recoveryDraft({ notas: 'Sólo usuario 3' });
    await formRecovery.saveFormDraft(3, 'quotation:dp:new', draft, 'dp-test');
    await formRecovery.saveFormDraft(4, 'quotation:dp:new', recoveryDraft({ notas: 'Sólo usuario 4' }), 'other');
    await formRecovery.saveFormDraft(3, 'quotation:new', { client: null, notas: 'Ordinaria', items: [], commercial: draft.commercial, createdQuotationId: null }, 'ordinary');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Empezar de nuevo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conservar captura' }));
    expect((await readDraft())!.payload.notas).toBe('Sólo usuario 3');
    fireEvent.click(screen.getByRole('button', { name: 'Empezar de nuevo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar captura' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeEnabled());
    expect(screen.getByLabelText('Notas (opcional)')).toHaveValue('');
    await flushDrafts();
    expect(await readDraft()).toBeNull();
    expect((await formRecovery.loadFormDraft(4, 'quotation:dp:new', dpQuotationRecoverySchema))!.payload.notas).toBe('Sólo usuario 4');
    expect((await formRecovery.loadFormDraft(3, 'quotation:new', quotationRecoverySchema))!.payload.notas).toBe('Ordinaria');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('conserva la captura y permite seguir editando tras un error al emitir', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Sin conexión'));
    const page = await recoverDraft(recoveryDraft());
    fireEvent.click(screen.getByRole('button', { name: 'Emitir Cotización D&P' }));
    await screen.findByText(/La captura se conserva para reintentar/);
    expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Notas (opcional)'), { target: { value: 'Reintentar mañana' } });
    await flushDrafts();
    expect((await readDraft())!.payload).toMatchObject({ notas: 'Reintentar mañana', createdQuotationId: null, items: [expect.anything()] });
    page.unmount();
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByLabelText('Notas (opcional)')).toHaveValue('Reintentar mañana');
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('guarda la identidad emitida antes de borrar y recupera el detalle sin reemitir si falla la limpieza local', async () => {
    const page = await recoverDraft(recoveryDraft());
    const clear = vi.spyOn(formRecovery, 'deleteFormDraft').mockRejectedValueOnce(new Error('Almacenamiento ocupado'));
    fireEvent.click(screen.getByRole('button', { name: 'Emitir Cotización D&P' }));
    expect(await screen.findByText('Detalle COT')).toBeInTheDocument();
    expect(screen.getByTestId('quotation-detail-id')).toHaveTextContent('99');
    expect((await readDraft())!.payload.createdQuotationId).toBe(99);
    expect(clear).toHaveBeenCalled();
    page.unmount();
    clear.mockRestore();
    renderPage();
    await screen.findByRole('button', { name: 'Recuperar formulario' });
    expect(api.post).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar formulario' }));
    expect(await screen.findByTestId('quotation-detail-id')).toHaveTextContent('99');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(await readDraft()).toBeNull();
  });

  it('termina de guardar una sola vez si se abandona la página durante la petición', async () => {
    let finish!: (value: AxiosResponse) => void;
    vi.mocked(api.post).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const page = await recoverDraft(recoveryDraft());
    fireEvent.click(screen.getByRole('button', { name: 'Emitir Cotización D&P' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Emitir Cotización D&P' }));
    const leave = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(leave); });
    expect(leave.defaultPrevented).toBe(true);
    page.unmount();
    await act(async () => { finish({ data: { quotation: { id: 99, codigo: 'COT-99' } } } as AxiosResponse); });
    await waitFor(async () => expect(await readDraft()).toBeNull());
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeEnabled());
    expect(screen.queryByText('Tienes un formulario pendiente')).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('bloquea una carrocería incompatible sin borrar ni recalcular parcialmente las filas y permite cancelar', async () => {
    const rows = [draftLine({ bodyTypeId: 'pickup', pieceId: 'capo', positionId: 'UNICA' }), draftLine({ bodyTypeId: 'pickup', pieceId: 'lateral_pickup' })];
    await recoverDraft(recoveryDraft({ bodyTypeId: 'pickup', items: rows }));
    fireEvent.click(screen.getByRole('button', { name: 'SUV' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Lateral de pickup/);
    expect(screen.getByRole('button', { name: 'Pickup' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Presupuesto (2)')).toBeInTheDocument();
    await flushDrafts();
    expect((await readDraft())!.payload.items).toEqual(rows);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cambio' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quitar Lateral de pickup/ }));
    fireEvent.click(screen.getByRole('button', { name: 'SUV' }));
    expect(screen.getByRole('button', { name: 'SUV' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Presupuesto (1)')).toBeInTheDocument();
    await flushDrafts();
    expect((await readDraft())!.payload.items[0]).toMatchObject({ precioUnitario: '141750', dpPricing: { bodyTypeId: 'suv', sizeId: 'M' } });
  });

  it('conserva el vehículo anterior si el vehículo reseleccionado es incompatible', async () => {
    const pickup = { ...vehicle, id: 22, patente: 'PICK12', dpBodyTypeId: 'pickup', dpSizeId: 'M' };
    await recoverDraft(recoveryDraft({ vehicleMode: 'registered', selectedVehicle: pickup, bodyTypeId: 'pickup', items: [draftLine({ bodyTypeId: 'pickup', pieceId: 'lateral_pickup' })] }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Vehículo' })).getByRole('button', { name: 'Cambiar' }));
    const input = screen.getByPlaceholderText('Buscar patente…');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ABCD' } });
    fireEvent.click(await screen.findByRole('button', { name: /ABCD-12/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Lateral de pickup/);
    expect(screen.getByText('PICK12')).toBeInTheDocument();
    expect(screen.getByText('Presupuesto (1)')).toBeInTheDocument();
    await flushDrafts();
    expect((await readDraft())!.payload).toMatchObject({ selectedVehicle: { id: 22 }, bodyTypeId: 'pickup', sizeId: 'M' });
  });

  it('rechaza M → S si el descuento fijo supera $15.300 y recalcula después de revisarlo', async () => {
    const row = draftLine({}, '17000');
    expect(row.precioUnitario).toBe('18000');
    await recoverDraft(recoveryDraft({ items: [row] }));
    fireEvent.click(screen.getByRole('button', { name: /S \(0[,.]85\)/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Retrovisor.*descuento/);
    expect(screen.getByRole('button', { name: /M \(1\)/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('dp-quotation-total')).toHaveTextContent('$1.190');
    await flushDrafts();
    expect((await readDraft())!.payload.items).toEqual([row]);
    fireEvent.click(screen.getByRole('button', { name: /Editar Retrovisor/ }));
    fireEvent.change(screen.getByLabelText('Valor descuento pieza'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar pieza' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Actualizar pieza' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /S \(0[,.]85\)/ }));
    expect(screen.getByRole('button', { name: /S \(0[,.]85\)/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('dp-quotation-total')).toHaveTextContent('$17.017');
    await flushDrafts();
    expect((await readDraft())!.payload.items[0]).toMatchObject({ precioUnitario: '15300', descuentoValor: '1000', dpPricing: { sizeId: 'S' }, dpPricingSnapshot: { precioUnitario: 15300 } });
  });

  it('muestra errores de importes recuperados sin lanzar durante el render', async () => {
    await recoverDraft(recoveryDraft({ items: [draftLine({}, '19000')] }));
    expect(screen.getByText('Presupuesto (1)')).toBeInTheDocument();
    expect(screen.getAllByRole('alert').some((alert) => /Revisa «Retrovisor.*descuento/.test(alert.textContent ?? ''))).toBe(true);
    expect(screen.getByTestId('dp-quotation-total')).toHaveTextContent('-');
    fireEvent.click(screen.getByRole('button', { name: 'Emitir Cotización D&P' }));
    expect(api.post).not.toHaveBeenCalled();
    await flushDrafts();
  });

  it.each(['size', 'body', 'piece', 'discount', 'size-roundtrip'])('ignora una tarifa asíncrona si cambia %s antes de confirmarla', async (change) => {
    let finish!: (value: AxiosResponse) => void;
    let selection!: DpQuoteInput;
    vi.mocked(api.post).mockImplementation((_url, raw) => {
      selection = dpQuoteInputSchema.parse(raw);
      return new Promise((resolve) => { finish = resolve; });
    });
    await recoverDraft(recoveryDraft({ items: [], selectedPieceKey: 'retrovisor:L', opIds: ['painting_full'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar pieza' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    if (change.startsWith('size')) {
      fireEvent.click(screen.getByRole('button', { name: /S \(0[,.]85\)/ }));
      if (change === 'size-roundtrip') fireEvent.click(screen.getByRole('button', { name: /M \(1\)/ }));
    } else if (change === 'body') {
      fireEvent.click(screen.getByRole('button', { name: 'SUV' }));
    } else if (change === 'piece') {
      fireEvent.click(within(screen.getByRole('group', { name: 'Diagrama interactivo del vehículo' })).getByRole('button', { name: 'Capó · Única' }));
    } else {
      fireEvent.change(screen.getByLabelText('Tipo descuento pieza'), { target: { value: 'porcentaje' } });
      fireEvent.change(screen.getByLabelText('Valor descuento pieza'), { target: { value: '10' } });
    }
    await act(async () => { finish({ data: { quote: calculateDpWorkQuote(dpRecord().configuration, selection, 2) } } as AxiosResponse); });
    expect(screen.getByText('Sin piezas ni repuestos agregados')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Emitir Cotización D&P' })).toBeEnabled());
    await flushDrafts();
    expect((await readDraft())!.payload.items).toEqual([]);
  });
});
