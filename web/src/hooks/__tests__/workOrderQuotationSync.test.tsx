import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useVerifyPaymentMutation } from '../useFinance';
import { paymentKeys, useQuotationPayments } from '../usePayments';
import { quotationKeys, useQuotation, useQuotations, useUpdateQuotationMutation } from '../useQuotations';
import { useReviewPriceSuggestionMutation } from '../useWorkOrderLabor';
import {
  useChangeWorkOrderStatusMutation,
  useCreateWorkOrderMutation,
  useDeliverWorkOrderMutation,
  useUpdateWorkOrderMutation,
  useUpdateWorkOrderExecutionMutation,
  useWorkOrder,
  workOrderKeys,
} from '../useWorkOrders';

import type { Quotation, QuotationPaymentSummary, WorkOrder, WorkOrderWorksheet } from '../../types/entities';
import type { DeliverWorkOrderInput } from '@unithor/shared';
import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const originalOrder: WorkOrder = {
  id: 12, codigo: 'OT-26-12', clientId: 7, vehicleId: 4, estado: 'en_progreso',
  descripcion: 'Revisión', kilometrajeIngreso: 1000, fechaIngreso: null,
  fechaEntrega: null, createdBy: 1, createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  quotation: { id: 44, codigo: 'COT-26-44', total: 60000, pagado: 10000, saldoPendiente: 50000, estadoPago: 'parcial' },
};
const originalQuotation: Quotation = {
  id: 44, codigo: 'COT-26-44', workOrderId: 12, clientId: 7, vehicleId: 4,
  asesorId: 1, estadoPago: 'parcial', subtotal: 60000, total: 60000, pagado: 10000,
  notas: null, createdAt: originalOrder.createdAt, updatedAt: originalOrder.updatedAt,
  workOrder: { id: 12, codigo: originalOrder.codigo, estado: 'en_progreso' },
};
const originalSummary: QuotationPaymentSummary = {
  quotationId: 44, total: 60000, pagado: 10000, saldoPendiente: 50000,
  estadoPago: 'parcial', payments: [],
};
const listKey = quotationKeys.list({});

describe('Sincronización visible de OT, COT y abonos con consultas en caché', () => {
  let client: QueryClient;
  let order: WorkOrder;
  let quotation: Quotation;
  let summary: QuotationPaymentSummary;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 120000 }, mutations: { retry: false } } });
    order = structuredClone(originalOrder);
    quotation = structuredClone(originalQuotation);
    summary = structuredClone(originalSummary);
    client.setQueryData(workOrderKeys.detail(12), order);
    client.setQueryData(quotationKeys.detail(44), quotation);
    client.setQueryData(paymentKeys.quotation(44), summary);
    client.setQueryData(listKey, { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    vi.mocked(api.get).mockImplementation(async (url) => {
      const data = url === '/work-orders/12' ? { workOrder: order }
        : url === '/quotations/44' ? { quotation }
          : url === '/quotations/44/payments' ? summary
            : url === '/quotations' ? { items: [quotation], total: 1, page: 1, pageSize: 20, totalPages: 1 }
              : undefined;
      if (!data) throw new Error(`Consulta inesperada: ${url}`);
      return { data } as AxiosResponse;
    });
  });

  afterEach(() => { client.clear(); });

  const changeTotal = () => {
    quotation = { ...quotation, subtotal: 90000, total: 90000 };
    summary = { ...summary, total: 90000, saldoPendiente: 80000 };
    order = { ...order, quotation: { ...originalOrder.quotation!, total: 90000, saldoPendiente: 80000 } };
  };

  it('muestra la COT espejo recién creada aunque el listado comercial estaba vacío en caché', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { workOrder: order } });
    const { result } = renderHook(() => ({ list: useQuotations({}), create: useCreateWorkOrderMutation() }), { wrapper });
    expect(result.current.list.data?.items).toHaveLength(0);
    await act(async () => { await result.current.create.mutateAsync({ clientId: 7, vehicleId: 4, items: [] }); });
    await waitFor(() => expect(result.current.list.data?.items[0].codigo).toBe('COT-26-44'));
  });

  it('actualiza el total de la COT y su saldo para abonar al editar los trabajos desde la OT', async () => {
    vi.mocked(api.patch).mockImplementation(async () => { changeTotal(); return { data: { workOrder: order } } as AxiosResponse; });
    const { result } = renderHook(() => ({ cot: useQuotation(44), payments: useQuotationPayments(44), edit: useUpdateWorkOrderMutation() }), { wrapper });
    await act(async () => { await result.current.edit.mutateAsync({ id: 12, data: { items: [] } }); });
    await waitFor(() => {
      expect(result.current.cot.data?.total).toBe(90000);
      expect(result.current.payments.data?.saldoPendiente).toBe(80000);
      expect(result.current.payments.data?.pagado).toBe(10000);
    });
  });

  it('actualiza OT, ficha del mecánico, stock y saldo al editar los conceptos desde la COT', async () => {
    client.setQueryData(['work-order-labor', 'worksheet', 12], { items: [{ id: 20, horasHombreReales: 2 }] });
    client.setQueryData(['warehouses', 'balances', 1], [{ catalogItemId: 5, cantidad: 10 }]);
    vi.mocked(api.patch).mockImplementation(async () => { changeTotal(); return { data: { quotation } } as AxiosResponse; });
    const { result } = renderHook(() => ({ ot: useWorkOrder(12), payments: useQuotationPayments(44), edit: useUpdateQuotationMutation() }), { wrapper });
    await act(async () => { await result.current.edit.mutateAsync({ id: 44, data: { items: [] } }); });
    await waitFor(() => {
      expect(result.current.ot.data?.quotation?.total).toBe(90000);
      expect(result.current.payments.data?.saldoPendiente).toBe(80000);
    });
    expect(client.getQueryState(['work-order-labor', 'worksheet', 12])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['warehouses', 'balances', 1])?.isInvalidated).toBe(true);
    expect(client.getQueryData(['work-order-labor', 'worksheet', 12])).toEqual({ items: [{ id: 20, horasHombreReales: 2 }] });
  });

  it('refleja el nuevo estado de taller dentro de la cotización vinculada', async () => {
    vi.mocked(api.patch).mockImplementation(async () => {
      order = { ...order, estado: 'finalizada' };
      quotation = { ...quotation, workOrder: { ...quotation.workOrder!, estado: 'finalizada' } };
      return { data: { workOrder: order } } as AxiosResponse;
    });
    const { result } = renderHook(() => ({ cot: useQuotation(44), change: useChangeWorkOrderStatusMutation() }), { wrapper });
    await act(async () => { await result.current.change.mutateAsync({ id: 12, data: { nuevoEstado: 'finalizada' } }); });
    await waitFor(() => expect(result.current.cot.data?.workOrder?.estado).toBe('finalizada'));
  });

  it('refleja la entrega en la COT sin alterar su estado de cobro', async () => {
    vi.mocked(api.post).mockImplementation(async () => {
      order = { ...order, estado: 'entregada' };
      quotation = { ...quotation, workOrder: { ...quotation.workOrder!, estado: 'entregada' } };
      return { data: { workOrder: order } } as AxiosResponse;
    });
    const { result } = renderHook(() => ({ cot: useQuotation(44), deliver: useDeliverWorkOrderMutation() }), { wrapper });
    const data: DeliverWorkOrderInput = {
      kilometrajeSalida: 1001, receptorNombre: 'Cliente Demo', receptorRut: '123456785',
      receptorTelefono: '+56912345678', checklist: [], conformidad: true, firmaRecepcion: 'Cliente Demo',
    };
    await act(async () => { await result.current.deliver.mutateAsync({ id: 12, data }); });
    await waitFor(() => expect(result.current.cot.data?.workOrder?.estado).toBe('entregada'));
    expect(result.current.cot.data?.estadoPago).toBe('parcial');
  });

  it('actualiza el saldo mostrado en la OT al verificar una transferencia desde Finanzas', async () => {
    vi.mocked(api.patch).mockImplementation(async () => {
      order = { ...order, quotation: { ...originalOrder.quotation!, pagado: 30000, saldoPendiente: 30000 } };
      return { data: { quotation: { ...order.quotation }, payment: { id: 5 } } } as AxiosResponse;
    });
    const { result } = renderHook(() => ({ ot: useWorkOrder(12), verify: useVerifyPaymentMutation() }), { wrapper });
    await act(async () => { await result.current.verify.mutateAsync({ paymentId: 5, data: { decision: 'aprobar' } }); });
    await waitFor(() => expect(result.current.ot.data?.quotation?.saldoPendiente).toBe(30000));
  });

  it('actualiza los importes para cobrar tras aprobar una sugerencia de precio', async () => {
    vi.mocked(api.patch).mockImplementation(async () => {
      changeTotal();
      return { data: { suggestion: { id: 3, estado: 'aprobada' } } } as AxiosResponse;
    });
    const { result } = renderHook(() => ({ ot: useWorkOrder(12), payments: useQuotationPayments(44), review: useReviewPriceSuggestionMutation() }), { wrapper });
    await act(async () => { await result.current.review.mutateAsync({ id: 12, suggestionId: 3, data: { decision: 'aprobar' } }); });
    await waitFor(() => {
      expect(result.current.ot.data?.quotation?.total).toBe(90000);
      expect(result.current.payments.data?.saldoPendiente).toBe(80000);
    });
  });

  it('conserva la ficha restringida del mecánico al sincronizar un avance', async () => {
    client.removeQueries({ queryKey: workOrderKeys.detail(12) });
    const worksheet: WorkOrderWorksheet = {
      workOrder: { id: 12, codigo: order.codigo, estado: 'en_progreso', fechaIngreso: null,
        descripcion: order.descripcion, vehiculo: { id: 4, patente: 'ABCD12', marca: null, modelo: null } },
      items: [], servicios: [], repuestos: [], observations: [], progressReports: [], activeItemId: null,
      totals: { items: 0, completados: 0, enProceso: 0, pendientes: 0, horasEstimadas: 2, horasReales: 1, minutosReales: 60 }, pausedOtherItems: 0,
    };
    vi.mocked(api.patch).mockResolvedValue({ data: { worksheet } });
    const { result } = renderHook(() => useUpdateWorkOrderExecutionMutation(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 12, data: { reporte: { porcentaje: 50, comentario: 'Revisión en curso' } } }); });
    expect(client.getQueryData(['work-order-labor', 'worksheet', 12])).toEqual(worksheet);
    expect(client.getQueryData(workOrderKeys.detail(12))).toBeUndefined();
    expect(client.getQueryState(quotationKeys.detail(44))?.isInvalidated).toBe(true);
  });

  it('mantiene los datos y los abonos visibles cuando el servidor rechaza una edición', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('El total no puede ser inferior a lo pagado'));
    const { result } = renderHook(() => ({ cot: useQuotation(44), payments: useQuotationPayments(44), edit: useUpdateWorkOrderMutation() }), { wrapper });
    await act(async () => {
      await expect(result.current.edit.mutateAsync({ id: 12, data: { items: [] } })).rejects.toThrow('inferior a lo pagado');
    });
    expect(result.current.cot.data).toEqual(originalQuotation);
    expect(result.current.payments.data).toEqual(originalSummary);
    expect(api.get).not.toHaveBeenCalled();
  });
});
