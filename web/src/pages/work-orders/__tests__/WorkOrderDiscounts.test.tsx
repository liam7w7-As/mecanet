import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyWorkOrderItem } from '../../../components/work-orders/WorkOrderItemsEditor';
import WorkOrderItemsModal from '../../../components/work-orders/WorkOrderItemsModal';
import { api } from '../../../lib/api';
import { flushFormDrafts, loadFormDraft, saveFormDraft } from '../../../lib/form-recovery';
import { workOrderRecoverySchema } from '../../../lib/form-recovery.schemas';
import { getWorkOrderPricing, getWorkOrderTotal } from '../../../lib/work-order-pricing';
import { useAuthStore } from '../../../stores/auth.store';
import { workshopRoleOrders } from '../../../test/fixtures/workshop-roles';
import WorkOrderCreatePage from '../WorkOrderCreatePage';

vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));

const person = { id: 7, nombre: 'Cliente descuentos', rut: null, tipo: 'cliente' as const, email: null, telefono: null, direccion: null };
const draft = () => workOrderRecoverySchema.parse({
  activeStep: 4, client: person, contactClient: person, billingClient: person,
  vehicle: { id: 4, patente: 'ABCD12', marca: 'Toyota', modelo: 'Yaris', ano: 2024, client: null },
  assignedMechanicId: null, kilometrajeIngreso: '12345', descripcion: 'Revisión', fechaIngreso: '2026-11-12T10:00', fechaEntrega: '',
  items: [{ ...createEmptyWorkOrderItem(), descripcion: 'Servicio con descuento', cantidad: '2', precioUnitario: '10000', descuentoTipo: 'porcentaje', descuentoValor: '10' }],
  discount: { descuentoTipo: 'fijo', descuentoValor: '3000' },
  inspection: { nivelCombustible: '', llantaDelanteraIzquierda: '', llantaDelanteraDerecha: '', llantaTraseraIzquierda: '', llantaTraseraDerecha: '', inventario: [], objetosValor: '', observaciones: '' },
  photos: [], createdOrder: null, uploadedSlots: [],
});
const renderCreate = (path = '/work-orders/new') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
  <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/work-orders/new" element={<WorkOrderCreatePage />} />
    <Route path="/quotations/:quotationId/convert-to-ot" element={<WorkOrderCreatePage />} />
    <Route path="/work-orders/:id" element={<p>Orden guardada</p>} />
  </Routes></MemoryRouter>
</QueryClientProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 1, nombre: 'Admin prueba', email: 'admin@example.test', role: 'admin' }, isAuthenticated: true, isLoading: false });
  vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/catalog' ? { items: [], total: 0, totalPages: 0 } : url === '/clients' ? { items: [person] } : { mechanics: [] } }));
  vi.mocked(api.post).mockResolvedValue({ data: { workOrder: { id: 77, codigo: 'OT-26-77' } } });
});

describe('OT and commercial discount consistency', () => {
  it('recovers discounts, shows identical net/IVA in review, and submits both discounts once', async () => {
    await saveFormDraft(1, 'work-order:new', draft(), 'discount-draft');
    renderCreate();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByLabelText('Descuento 1')).toHaveValue(10);
    expect(screen.getByLabelText('Descuento general')).toHaveValue('3.000');
    expect(screen.getByTestId('work-order-total')).toHaveTextContent('$17.850');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    const review = within(await screen.findByRole('dialog', { name: 'Confirmar recepción de OT' }));
    expect(review.getByText('$15.000')).toBeInTheDocument();
    expect(review.getByText('$2.850')).toBeInTheDocument();
    expect(review.getByText('$17.850')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(review.getByRole('button', { name: 'Confirmar y crear orden' }));
    await screen.findByText('Orden guardada');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/work-orders', expect.objectContaining({
      descuentoTipo: 'fijo', descuentoValor: 3000,
      items: [expect.objectContaining({ cantidad: 2, precioUnitario: 10000, descuentoTipo: 'porcentaje', descuentoValor: 10 })],
    }));
    await act(async () => { await flushFormDrafts(); });
    expect(await loadFormDraft(1, 'work-order:new', workOrderRecoverySchema)).toBeNull();
  });

  it('blocks excess discounts and retains the edited values in recovery', async () => {
    await saveFormDraft(1, 'work-order:new', draft(), 'invalid-discount');
    renderCreate();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    fireEvent.change(screen.getByLabelText('Descuento general'), { target: { value: '19000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    expect(screen.queryByRole('dialog', { name: 'Confirmar recepción de OT' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('descuento'))).toBe(true);
    expect(api.post).not.toHaveBeenCalled();
    await act(async () => { await flushFormDrafts(); });
    expect((await loadFormDraft(1, 'work-order:new', workOrderRecoverySchema))?.payload.discount.descuentoValor).toBe('19000');
  });

  it('recovers a conversion without losing source line IDs or sending browser discounts', async () => {
    const saved = draft();
    saved.items[0].id = 99;
    saved.items[0].key = 'recovered-stable-line';
    await saveFormDraft(1, 'work-order:convert:44', saved, 'conversion-discounts');
    const quotation = { id: 44, codigo: 'COT-26-44', clientId: 7, vehicleId: 4, workOrderId: null, total: 15000,
      descuentoTipo: 'fijo', descuentoValor: 3000, items: [{ ...saved.items[0], id: 99 }] };
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/quotations/44') return Promise.resolve({ data: { quotation } });
      if (url === '/clients/7') return Promise.resolve({ data: { client: person } });
      if (url === '/vehicles/4') return Promise.resolve({ data: { vehicle: saved.vehicle } });
      return baseGet(url, config);
    });
    vi.mocked(api.post).mockResolvedValue({ data: { workOrder: { id: 77, codigo: 'OT-26-77' }, quotation } });
    renderCreate('/quotations/44/convert-to-ot');
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(screen.getByTestId('conversion-total')).toHaveTextContent('$17.850');
    expect(screen.getByLabelText('Tipo de descuento general')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y crear orden' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y crear orden' }));
    await screen.findByText('Orden guardada');
    const [url, body] = vi.mocked(api.post).mock.calls[0];
    expect(url).toBe('/quotations/44/convert-to-ot');
    expect(body).toEqual(expect.objectContaining({ itemAssignments: [{ quotationItemId: 99, assignedUserId: null }] }));
    expect(body).not.toHaveProperty('items');
    expect(body).not.toHaveProperty('descuentoTipo');
    expect(body).not.toHaveProperty('descuentoValor');
  });

  it('keeps stored item identity and discounts when editing an OT', async () => {
    const order = { ...workshopRoleOrders[0], descuentoTipo: 'fijo' as const, descuentoValor: 3000,
      items: [{ ...workshopRoleOrders[0].items![0], cantidad: 2, precioUnitario: 10000, descuentoTipo: 'porcentaje' as const, descuentoValor: 10 }] };
    const close = vi.fn();
    vi.mocked(api.patch).mockResolvedValue({ data: { workOrder: order } });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WorkOrderItemsModal workOrder={order} onClose={close} /></QueryClientProvider>);
    expect(screen.getByLabelText('Descuento 1')).toHaveValue(10);
    expect(screen.getByTestId('work-order-edit-total')).toHaveTextContent('$17.850');
    fireEvent.change(screen.getByLabelText('Precio unitario 1'), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar trabajos' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(api.patch).toHaveBeenCalledWith(`/work-orders/${order.id}`, expect.objectContaining({
      descuentoTipo: 'fijo', descuentoValor: 3000,
      items: [expect.objectContaining({ id: order.items[0].id, descuentoTipo: 'porcentaje', descuentoValor: 10, precioUnitario: 20000 })],
    }));
  });

  it('uses one discounted net amount and applies IVA once, preferring the mirrored total', () => {
    const order = { ...workshopRoleOrders[0], quotation: null, descuentoTipo: 'fijo' as const, descuentoValor: 3000,
      items: [{ ...workshopRoleOrders[0].items![0], cantidad: 2, precioUnitario: 10000, descuentoTipo: 'porcentaje' as const, descuentoValor: 10 }] };
    expect(getWorkOrderPricing(order)).toMatchObject({ subtotal: 20000, descuentoLineas: 2000, descuentoGeneral: 3000, neto: 15000, iva: 2850, total: 17850 });
    expect(getWorkOrderTotal(order)).toBe(17850);
    expect(getWorkOrderTotal({ ...order, quotation: { id: 1, codigo: 'COT-26-1', estadoPago: 'parcial', total: 17850, pagado: 1000, saldoPendiente: 16850 } })).toBe(17850);
  });
});
