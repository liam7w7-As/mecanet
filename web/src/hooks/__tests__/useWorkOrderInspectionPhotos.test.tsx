import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useDeleteWorkOrderInspectionPhotoMutation, useUploadWorkOrderInspectionPhotosMutation } from '../useWorkOrders';

import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), delete: vi.fn() },
}));

afterEach(() => vi.clearAllMocks());

const setup = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const quotationKey = ['quotations', 'detail', 31];
  queryClient.setQueryData(quotationKey, { id: 31, workOrderId: 12, workOrder: { inspectionPhotos: [] } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, quotationKey, wrapper };
};

describe('inspection photos keep the linked quotation current', () => {
  it('invalidates the quotation detail after uploading an OT photo', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { photo: { id: 1, slot: 'frontal' } } } as AxiosResponse);
    const { queryClient, quotationKey, wrapper } = setup();
    const { result } = renderHook(() => useUploadWorkOrderInspectionPhotosMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 12,
        photos: [{ slot: 'frontal', file: new File(['photo'], 'frontal.png', { type: 'image/png' }) }],
      });
    });

    expect(queryClient.getQueryState(quotationKey)?.isInvalidated).toBe(true);
  });

  it('invalidates the quotation detail after deleting an OT photo', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: undefined } as AxiosResponse);
    const { queryClient, quotationKey, wrapper } = setup();
    const { result } = renderHook(() => useDeleteWorkOrderInspectionPhotoMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 12, slot: 'frontal' });
    });

    expect(queryClient.getQueryState(quotationKey)?.isInvalidated).toBe(true);
  });

  it('invalidates both documents when an upload batch only partially succeeds', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: { photo: { id: 1, slot: 'frontal' } } } as AxiosResponse)
      .mockRejectedValueOnce(new Error('Second photo failed'));
    const { queryClient, quotationKey, wrapper } = setup();
    queryClient.setQueryData(['work-orders', 'detail', 12], { id: 12, inspection: { photos: [] } });
    const { result } = renderHook(() => useUploadWorkOrderInspectionPhotosMutation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({
        id: 12,
        photos: [
          { slot: 'frontal', file: new File(['first'], 'frontal.png', { type: 'image/png' }) },
          { slot: 'trasera', file: new File(['second'], 'trasera.png', { type: 'image/png' }) },
        ],
      })).rejects.toThrow('Second photo failed');
    });

    expect(queryClient.getQueryState(quotationKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['work-orders', 'detail', 12])?.isInvalidated).toBe(true);
  });
});
