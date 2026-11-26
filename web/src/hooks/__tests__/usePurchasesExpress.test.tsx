import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { purchaseFixture } from '../../pages/purchases/__tests__/fixtures';
import { useReturnPurchaseToStockMutation } from '../usePurchases';
import { useCreateExpressPurchase } from '../usePurchasesExpress';

import type { CreateExpressPurchaseBatchInput } from '@unithor/shared';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { post: vi.fn() } }));

const setup = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 2 }, queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
};

describe('Compras express: envío del comprobante completo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('envía todos los productos y sus OT en una sola compra con una sola foto', async () => {
    const data: CreateExpressPurchaseBatchInput = {
      operationKey: crypto.randomUUID(), workOrderId: 10, conIva: true,
      metodoPago: 'efectivo', tipoDocumento: 'recibo',
      items: [
        { descripcion: 'Filtro', cantidad: 2, costoUnitario: 1000, ventaUnitario: 1250 },
        { descripcion: 'Ampolleta', cantidad: 1, costoUnitario: 2000, ventaUnitario: 2500, workOrderId: 11 },
      ],
    };
    const photo = new File(['photo'], 'recibo.jpg', { type: 'image/jpeg' });
    vi.mocked(api.post).mockResolvedValue({ data: { purchase: purchaseFixture } });
    const { wrapper, client } = setup();
    client.setQueryData(['quotations', 'list'], { items: [] });
    const { result } = renderHook(() => useCreateExpressPurchase(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ data, file: photo }); });
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = vi.mocked(api.post).mock.calls[0];
    expect(url).toBe('/purchases/express');
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(JSON.parse(String(form.get('payload')))).toEqual(data);
    expect(form.getAll('comprobante')).toHaveLength(1);
    expect(client.getQueryData(['purchases', 'detail', purchaseFixture.id])).toEqual(purchaseFixture);
    expect(client.getQueryState(['quotations', 'list'])?.isInvalidated).toBe(true);
  });

  it('envía la selección de productos a stock sin anular el resto de la compra', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { purchase: purchaseFixture } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useReturnPurchaseToStockMutation(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ purchaseId: 1, motivo: 'No fue necesario', itemIds: [4, 6] }); });
    expect(api.post).toHaveBeenCalledWith('/purchases/1/return-to-stock', { motivo: 'No fue necesario', itemIds: [4, 6] });
  });
});
