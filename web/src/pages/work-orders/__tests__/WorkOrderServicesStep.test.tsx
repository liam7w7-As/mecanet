import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { calculateDpWorkQuote, createDefaultDpConfiguration, dpQuoteInputSchema } from '@unithor/shared';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyWorkOrderItem } from '../../../components/work-orders/WorkOrderItemsEditor';
import { api } from '../../../lib/api';
import { flushFormDrafts, loadFormDraft, saveFormDraft } from '../../../lib/form-recovery';
import { workOrderRecoverySchema } from '../../../lib/form-recovery.schemas';
import { useAuthStore } from '../../../stores/auth.store';
import WorkOrderCreatePage from '../WorkOrderCreatePage';

import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));
vi.mock('../../../hooks/useCatalogEvents', () => ({ useCatalogEvents: vi.fn() }));
const configuration = createDefaultDpConfiguration();
const record = { revision: 1, configuration, lastEditor: null, updatedAt: '2026-11-24T12:00:00Z' };
const person = { id: 7, nombre: 'Cliente actual', rut: null, tipo: 'cliente', telefono: null, email: null, direccion: null };
const oldVehicle = { id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Corolla', ano: 2024, client: null, dpBodyTypeId: 'sedan', dpSizeId: 'M' };
const sourceVehicle = { ...oldVehicle, id: 9, patente: 'ZZZZ99', dpBodyTypeId: 'suv', dpSizeId: 'XL' };
const sourceClient = { ...person, id: 8, nombre: 'Cliente desde OT' };
const sourceOrder = { id: 12, codigo: 'OT-26-12', clientId: 8, vehicleId: 9, client: sourceClient, vehicle: sourceVehicle,
  items: [{ descripcion: 'NO COPIAR TRABAJO' }], estado: 'entregada', fechaIngreso: '2020-01-01T00:00:00Z' };
const draft = () => workOrderRecoverySchema.parse({
  activeStep: 4, client: person, contactClient: person, billingClient: person, vehicle: oldVehicle,
  assignedMechanicId: null, kilometrajeIngreso: '', descripcion: 'Recepción actual', fechaIngreso: '2026-11-24T12:00', fechaEntrega: '',
  items: [], inspection: { nivelCombustible: '', llantaDelanteraIzquierda: '', llantaDelanteraDerecha: '',
    llantaTraseraIzquierda: '', llantaTraseraDerecha: '', inventario: [], objetosValor: '', observaciones: '' },
  photos: [], createdOrder: null, uploadedSlots: [],
});

async function mount(data = draft()) {
  await saveFormDraft(1, 'work-order:new', data, 'step5-draft');
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <MemoryRouter initialEntries={['/work-orders/new']}><Routes>
      <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
      <Route path="/work-orders/:id" element={<p>OT guardada</p>} />
    </Routes></MemoryRouter>
  </QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
  await screen.findAllByText('Sedán · M');
}

describe('New OT step 5 integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 1, nombre: 'Admin', role: 'admin', email: 'admin@test.cl' }, isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockImplementation(async (url) => ({ data:
      url === '/catalog/dp' ? record :
        url === '/work-orders' ? { items: [sourceOrder] } :
          url === '/work-orders/12' ? { workOrder: sourceOrder } :
            url === '/vehicles/9' ? { vehicle: sourceVehicle } :
              url === '/clients/8' ? { client: sourceClient } :
                url === '/work-orders/mechanics' ? { mechanics: [] } : { items: [], totalPages: 0 },
    }) as AxiosResponse);
    vi.mocked(api.post).mockImplementation(async (url, input) => ({ data: url === '/catalog/dp/quote'
      ? { quote: calculateDpWorkQuote(configuration, dpQuoteInputSchema.parse(input), 1) }
      : { workOrder: { id: 77, codigo: 'OT-26-77' } } }) as AxiosResponse);
  });

  it('sends the DP selection once after the reception review, not the internal preview snapshot', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('Pieza y ubicación'), { target: { value: JSON.stringify(['puerta', 'FL']) } });
    fireEvent.change(screen.getByLabelText('Pintura'), { target: { value: 'painting_full' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await screen.findByRole('button', { name: 'Editar servicio D&P 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    const review = within(await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' }));
    expect(review.getByText(/Sedán M · Puerta Delantera izquierda/)).toBeInTheDocument();
    expect(vi.mocked(api.post).mock.calls.filter(([url]) => url === '/work-orders')).toHaveLength(0);
    fireEvent.click(review.getByRole('button', { name: 'Confirmar y crear orden' }));
    await screen.findByText('OT guardada');
    const creates = vi.mocked(api.post).mock.calls.filter(([url]) => url === '/work-orders');
    expect(creates).toHaveLength(1);
    const payload = creates[0][1] as { items: Array<Record<string, unknown>> };
    expect(payload.items[0]).toMatchObject({ division: 'DP', subtipo: 'servicio_dp',
      dpPricing: { bodyTypeId: 'sedan', sizeId: 'M', pieceId: 'puerta', positionId: 'FL' } });
    expect(payload.items[0]).not.toHaveProperty('dpPricingSnapshot');
  });

  it('only replaces identification after source confirmation and does not copy old jobs or dates', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cargar desde una OT' }));
    fireEvent.click(await screen.findByRole('button', { name: /OT-26-12/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revisar datos' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Revisar datos' }));
    expect(screen.getByText('Sedán · M')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y cargar datos' }));
    await screen.findByText('SUV · XL');
    expect(screen.queryByText('NO COPIAR TRABAJO')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    const review = within(await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' }));
    expect(review.getByText('ZZZZ99')).toBeInTheDocument();
    expect(review.getAllByText('Cliente desde OT').length).toBeGreaterThan(0);
    expect(review.queryByText(/2020/)).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('requires repricing an existing DP card after loading a different vehicle classification', async () => {
    const data = draft();
    const quote = calculateDpWorkQuote(configuration, dpQuoteInputSchema.parse({
      configurationRevision: 1, bodyTypeId: 'sedan', sizeId: 'M', scope: 'piece',
      pieceId: 'puerta', positionId: 'FL', operations: [{ operationId: 'painting_full' }],
    }), 1);
    data.items.push({ ...createEmptyWorkOrderItem(), division: 'DP', subtipo: 'servicio_dp',
      descripcion: 'Pintura puerta', precioUnitario: String(quote.precioUnitario), dpPricing: quote.selection, dpPricingSnapshot: quote });
    await mount(data);
    fireEvent.click(screen.getByRole('button', { name: 'Cargar desde una OT' }));
    fireEvent.click(await screen.findByRole('button', { name: /OT-26-12/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revisar datos' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Revisar datos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y cargar datos' }));
    await screen.findByText('SUV · XL');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El vehículo cambió');
    expect(screen.queryByRole('dialog', { name: 'Confirmar recepción de OT' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar servicio D&P 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    expect(await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' })).toBeInTheDocument();
  });

  it('submits only committed ACC values and applies the line discount once', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/catalog') return Promise.resolve({ data: { items: [{
        id: 71, tipo: 'parte', division: 'ACC', subtipo: 'en_stock', codigo: 'ACC-71',
        nombre: 'Aceite 10W40 1L', unidadMedida: 'litro', precio: 10000, stock: 8,
        horasHombreEstandar: null,
      }], total: 1, totalPages: 1 } } as AxiosResponse);
      return baseGet(url, config);
    });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Repuestos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar Aceite 10W40 1L' }));
    fireEvent.change(screen.getByLabelText('Cantidad ACC'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Tipo de descuento ACC'), { target: { value: 'fijo' } });
    fireEvent.change(screen.getByLabelText('Descuento ACC'), { target: { value: '5000' } });
    expect(screen.queryByTestId('work-order-total')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const card = within(await screen.findByRole('article', { name: 'Repuesto ACC 1' }));
    expect(card.getByTestId('item-subtotal-0')).toHaveTextContent('$15.000');
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('$17.850');
    fireEvent.click(screen.getByRole('button', { name: 'Editar repuesto ACC 1' }));
    fireEvent.change(screen.getByLabelText('Precio unitario ACC'), { target: { value: '20000' } });
    // Even a reception review opened before saving must still use the committed values.
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    const review = within(await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' }));
    expect(review.getByText('$17.850')).toBeInTheDocument();
    fireEvent.click(review.getByRole('button', { name: 'Confirmar y crear orden' }));
    await screen.findByText('OT guardada');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/work-orders', expect.objectContaining({
      items: [expect.objectContaining({
        catalogItemId: 71, tipoLinea: 'parte', division: 'ACC', subtipo: 'en_stock',
        cantidad: 2, unidadMedida: 'litro', precioUnitario: 10000, descuentoTipo: 'fijo', descuentoValor: 5000,
      })],
    }));
  });

  it.each(['estandar', 'especifico'] as const)('submits a catalogue MEC %s with the intended OT price and preserves it in recovery', async (subtype) => {
    const specific = subtype === 'especifico';
    const service = { id: specific ? 82 : 81, tipo: subtype, division: 'MEC', subtipo: subtype,
      nombre: specific ? 'Diagnóstico eléctrico' : 'Cambio de aceite', precio: specific ? 45000 : 15000,
      codigo: specific ? 'MEC-82' : 'MEC-81', unidadMedida: 'servicio', stock: 0, horasHombreEstandar: specific ? null : 0.5 };
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/catalog') return Promise.resolve({ data: { items: [service], total: 1, totalPages: 1 } } as AxiosResponse);
      return baseGet(url, config);
    });
    await mount();
    fireEvent.click(within(screen.getByRole('group', { name: 'Tipo de catálogo' })).getByRole('button', { name: 'Estándar' }));
    if (specific) fireEvent.click(screen.getByRole('button', { name: 'Específicos' }));
    fireEvent.click(await screen.findByRole('button', { name: `Configurar ${service.nombre}` }));
    if (specific) {
      expect(screen.getByLabelText('Precio unitario MEC')).toHaveValue('1');
      fireEvent.change(screen.getByLabelText('Descripción MEC'), { target: { value: 'Diagnóstico eléctrico: falla de arranque' } });
    } else {
      fireEvent.change(screen.getByLabelText('Cantidad MEC'), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText('Tipo de descuento MEC'), { target: { value: 'porcentaje' } });
      fireEvent.change(screen.getByLabelText('Descuento MEC'), { target: { value: '10' } });
    }
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await screen.findByRole('article', { name: 'Servicio MEC 1' });
    expect(screen.getByTestId('work-order-total')).toHaveTextContent(specific ? '$1' : '$32.130');
    await act(async () => { await flushFormDrafts(); });
    const saved = await loadFormDraft(1, 'work-order:new', workOrderRecoverySchema);
    expect(saved?.payload.items[0]).toMatchObject({ catalogItemId: service.id, division: 'MEC', tipoLinea: subtype,
      subtipo: subtype, precioUnitario: specific ? '1' : '15000' });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    const review = within(await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' }));
    expect(review.getByText(specific ? 'Diagnóstico eléctrico: falla de arranque' : 'Cambio de aceite')).toBeInTheDocument();
    fireEvent.click(review.getByRole('button', { name: 'Confirmar y crear orden' }));
    await screen.findByText('OT guardada');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/work-orders', expect.objectContaining({
      items: [expect.objectContaining({
        catalogItemId: service.id, division: 'MEC', tipoLinea: subtype, subtipo: subtype,
        cantidad: specific ? 1 : 2, precioUnitario: specific ? 1 : 15000,
        descuentoTipo: specific ? null : 'porcentaje', descuentoValor: specific ? 0 : 10,
      })],
    }));
    expect(api.patch).not.toHaveBeenCalled();
    expect(service.precio).toBe(specific ? 45000 : 15000);
  });
});
