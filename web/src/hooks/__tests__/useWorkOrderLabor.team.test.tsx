import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { laborKeys, useAssignItemTeamMutation } from '../useWorkOrderLabor';

import type { WorkOrderWorksheet } from '../../types/entities';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { post: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));

const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
afterEach(() => { client.clear(); vi.restoreAllMocks(); });

describe('useAssignItemTeamMutation', () => {
  it('posts the team contract, replaces the worksheet and invalidates the same labor dependents', async () => {
    const worksheet = { items: [{ id: 4, assignments: [] }] } as unknown as WorkOrderWorksheet;
    const data = { members: [{ userId: 9, specialtyId: null, estimatedHours: 2 }, { userId: 10, estimatedHours: null }], motivo: 'Distribución de trabajo' };
    vi.mocked(api.post).mockResolvedValueOnce({ data: { worksheet } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useAssignItemTeamMutation, { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 41, itemId: 4, data }); });
    expect(api.post).toHaveBeenCalledWith('/work-orders/41/items/4/team', data);
    expect(client.getQueryData(laborKeys.worksheet(41))).toBe(worksheet);
    for (const queryKey of [laborKeys.mine(), laborKeys.worksheets(), ['work-order-labor', 'daily'], ['work-orders'], ['quotations'], ['catalog'], ['warehouses'], ['dashboard']]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('does not replace saved worksheet data when team assignment fails', async () => {
    const saved = { items: [{ id: 4 }] };
    client.setQueryData(laborKeys.worksheet(41), saved);
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Sin conexión'));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useAssignItemTeamMutation, { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ id: 41, itemId: 4, data: { members: [], motivo: 'Reorganizar equipo' } })).rejects.toThrow('Sin conexión'); });
    expect(client.getQueryData(laborKeys.worksheet(41))).toEqual(saved);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
