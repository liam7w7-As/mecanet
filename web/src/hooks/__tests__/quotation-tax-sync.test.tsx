import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { getQuotationGrossTotal } from '@unithor/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { paymentKeys, useCreatePaymentMutation, useDeletePaymentMutation, useQuotationPayments } from '../usePayments';
import { quotationKeys, useQuotation } from '../useQuotations';

import type { Payment, Quotation, QuotationPaymentSummary } from '../../types/entities';
import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

describe('Net quotation DTO and gross payment cache', () => {
  let client: QueryClient;
  let paid: number;
  const quotation: Quotation = { id: 44, codigo: 'COT-26-44', clientId: 1, vehicleId: null, workOrderId: null,
    asesorId: 1, total: 100000, subtotal: 100000, pagado: 0, estadoPago: 'por_pagar', notas: null,
    createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z' };
  const payment = { id: 9, quotationId: 44, monto: 30000, metodo: 'efectivo' } as Payment;
  const summary = (): QuotationPaymentSummary => ({ quotationId: 44, total: 119000, pagado: paid, saldoPendiente: 119000 - paid,
    estadoPago: paid > 0 ? 'parcial' : 'por_pagar', payments: paid > 0 ? [payment] : [] });
  const response = () => ({ quotation: { id: 44, codigo: quotation.codigo, total: 119000, pagado: paid, saldoPendiente: 119000 - paid, estadoPago: summary().estadoPago } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const useBalances = () => ({ quotation: useQuotation(44), payments: useQuotationPayments(44), add: useCreatePaymentMutation(), remove: useDeletePaymentMutation() });

  beforeEach(() => {
    vi.clearAllMocks(); paid = 0;
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
    client.setQueryData(quotationKeys.detail(44), quotation);
    client.setQueryData(paymentKeys.quotation(44), summary());
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/quotations/44'
      ? { quotation: { ...quotation, pagado: paid, estadoPago: summary().estadoPago } } : summary() } as AxiosResponse));
    vi.mocked(api.post).mockImplementation(async () => { paid = 30000; return { data: { payment, ...response() } } as AxiosResponse; });
    vi.mocked(api.delete).mockImplementation(async () => { paid = 0; return { data: { message: 'Anulado', ...response() } } as AxiosResponse; });
  });
  afterEach(() => client.clear());

  it('adds a payment using the gross balance without overwriting the net quotation or charging IVA twice', async () => {
    const { result } = renderHook(useBalances, { wrapper });
    await act(async () => { await result.current.add.mutateAsync({ quotationId: 44, monto: 30000, metodo: 'efectivo' }); });
    await waitFor(() => expect(result.current.payments.data?.pagado).toBe(30000));
    expect(result.current.quotation.data?.total).toBe(100000);
    expect(getQuotationGrossTotal(result.current.quotation.data!.total)).toBe(119000);
    expect(result.current.payments.data).toMatchObject({ total: 119000, saldoPendiente: 89000 });
  });

  it('annuls a payment preserving the same gross total and restored pending balance', async () => {
    paid = 30000;
    client.setQueryData(paymentKeys.quotation(44), summary());
    const { result } = renderHook(useBalances, { wrapper });
    await act(async () => { await result.current.remove.mutateAsync({ paymentId: 9, quotationId: 44 }); });
    await waitFor(() => expect(result.current.payments.data?.pagado).toBe(0));
    expect(result.current.payments.data).toMatchObject({ total: 119000, saldoPendiente: 119000, estadoPago: 'por_pagar', payments: [] });
    expect(result.current.quotation.data?.total).toBe(100000);
    expect(getQuotationGrossTotal(result.current.quotation.data!.total)).toBe(result.current.payments.data?.total);
  });
});
