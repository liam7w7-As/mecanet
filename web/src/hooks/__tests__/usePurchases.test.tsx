import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { purchaseFixture, supplierFixture } from '../../pages/purchases/__tests__/fixtures';
import { purchaseKeys, useCreatePurchaseMutation, useRegisterPurchasePaymentMutation, useVoidPurchaseMutation } from '../usePurchases';

import type { CreatePurchaseInput } from '@unithor/shared';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { post: vi.fn(), patch: vi.fn() } }));

const setup = () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: 1, retryDelay: 0 }, queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

const createInput: CreatePurchaseInput = {
  proveedorNombre: 'Proveedor nuevo', conIva: true, formaPago: 'contado', metodoPago: 'efectivo',
  tipoDocumento: 'factura', folio: 'F-1001', fechaEmision: '2026-01-01', montoComprobante: 11900,
  numeroOperacion: 'OP-1001', banco: 'Banco de Chile',
  items: [{ descripcion: 'Filtro', cantidad: 2, precioUnitario: 5000, afectaStock: false }],
};

describe('purchase mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('no reintenta automáticamente un alta aunque el cliente tenga retries globales', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Respuesta perdida'));
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreatePurchaseMutation(), { wrapper });
    act(() => result.current.mutate({
      data: createInput, comprobante: new File(['%PDF-1.4'], 'comprobante.pdf'),
    }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('actualiza el detalle y refresca proveedores después del alta', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { purchase: purchaseFixture } });
    const { client, wrapper } = setup();
    client.setQueryData(purchaseKeys.supplierList({ page: 1 }), { items: [supplierFixture] });
    const { result } = renderHook(() => useCreatePurchaseMutation(), { wrapper });
    await act(async () => { await result.current.mutateAsync({
      data: createInput, comprobante: new File(['%PDF-1.4'], 'comprobante.pdf'),
    }); });
    expect(client.getQueryData(purchaseKeys.detail(purchaseFixture.id))).toEqual(purchaseFixture);
    expect(client.getQueryState(purchaseKeys.supplierList({ page: 1 }))?.isInvalidated).toBe(true);
  });

  it('conserva la respuesta del pago y de la anulación en el detalle antes de recargar', async () => {
    const paid = { ...purchaseFixture, pagadoAt: '2026-10-20T12:30:00.000Z', cashMovementId: 20 };
    const voided = { ...paid, estado: 'anulada', voidedAt: '2026-10-21T12:00:00.000Z' };
    vi.mocked(api.post).mockResolvedValue({ data: { purchase: paid } });
    vi.mocked(api.patch).mockResolvedValue({ data: { purchase: voided } });
    const { client, wrapper } = setup();
    client.setQueryData(purchaseKeys.detail(purchaseFixture.id), purchaseFixture);
    const { result } = renderHook(() => ({
      pay: useRegisterPurchasePaymentMutation(), void: useVoidPurchaseMutation(),
    }), { wrapper });
    await act(async () => { await result.current.pay.mutateAsync({
      purchaseId: purchaseFixture.id, data: { metodo: 'transferencia' },
    }); });
    expect(client.getQueryData(purchaseKeys.detail(purchaseFixture.id))).toEqual(paid);
    await act(async () => { await result.current.void.mutateAsync({
      purchaseId: purchaseFixture.id, motivo: 'Compra duplicada',
    }); });
    expect(client.getQueryData(purchaseKeys.detail(purchaseFixture.id))).toEqual(voided);
  });
});
