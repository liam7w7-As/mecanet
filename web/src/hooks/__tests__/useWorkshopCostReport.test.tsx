import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { salesScopeEpochKey } from '../../lib/sales-access-cache';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError } from '../../stores/toast.store';
import { useWorkshopCostReportDownload } from '../useWorkshopCostReport';

import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));
vi.mock('../../stores/toast.store', () => ({ notifyError: vi.fn() }));
const filters = {
  fechaDesde: '2026-11-01',
  fechaHasta: '2026-11-02',
  userId: 7,
  workOrderId: 40,
  specialtyId: 3,
  estado: 'en_progreso' as const,
  search: 'motor',
};
const pdf = () =>
  ({
    data: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    headers: { 'content-type': 'application/pdf' },
  }) as AxiosResponse<Blob>;

describe('Confidential cost report downloads', () => {
  let client: QueryClient;
  let popup: {
    location: { href: string };
    close: ReturnType<typeof vi.fn>;
    closed: boolean;
    opener: Window | null;
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    useAuthStore
      .getState()
      .setUser({ id: 1, nombre: 'Jefe', email: 'jefe@example.invalid', role: 'jefe' });
    popup = { location: { href: '' }, close: vi.fn(), closed: false, opener: window };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:cost-report'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(api.get).mockResolvedValue(pdf());
  });
  afterEach(() => {
    client.clear();
    vi.restoreAllMocks();
  });

  it('opens one inline PDF with the exact selected filters and no duplicate clicks', async () => {
    const { result } = renderHook(useWorkshopCostReportDownload, { wrapper });
    act(() => {
      result.current.download('pdf', filters);
      result.current.download('pdf', filters);
    });
    expect(window.open).toHaveBeenCalledOnce();
    expect(popup.opener).toBeNull();
    await waitFor(() => expect(popup.location.href).toBe('blob:cost-report'));
    expect(api.get).toHaveBeenCalledOnce();
    expect(api.get).toHaveBeenCalledWith('/reports/workshop-costs/pdf', {
      params: filters,
      responseType: 'blob',
    });
  });
  it('exports Excel with all selected filters and no screen pagination', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: new Blob(['xlsx'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      headers: {},
    });
    const { result } = renderHook(useWorkshopCostReportDownload, { wrapper });
    act(() => result.current.download('excel', filters));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce());
    expect(api.get).toHaveBeenCalledWith('/reports/workshop-costs/excel', {
      params: filters,
      responseType: 'blob',
    });
    expect(window.open).not.toHaveBeenCalled();
  });
  it.each(['permission', 'logout', 'scope', 'identity'] as const)(
    'discards an in-flight export after %s changes',
    async (cause) => {
      let finish: ((value: AxiosResponse<Blob>) => void) | undefined;
      vi.mocked(api.get).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const { result } = renderHook(useWorkshopCostReportDownload, { wrapper });
      act(() => result.current.download('pdf', filters));
      await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
      act(() => {
        if (cause === 'logout') useAuthStore.getState().setUser(null);
        else if (cause === 'scope') client.setQueryData(salesScopeEpochKey, 1);
        else if (cause === 'identity')
          useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, id: 2 });
        else
          useAuthStore
            .getState()
            .setUser({
              ...useAuthStore.getState().user!,
              permissions: [{ modulo: 'taller', accion: 'read' }],
            });
      });
      await act(async () => finish?.(pdf()));
      await waitFor(() => expect(popup.close).toHaveBeenCalledOnce());
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    },
  );
  it('blocks mechanics even if cost-area grants are forced', () => {
    useAuthStore.getState().setUser({
      id: 3,
      nombre: 'Mecánico',
      email: 'm@example.invalid',
      role: 'mecanico',
      permissions: [
        { modulo: 'taller', accion: 'read' },
        { modulo: 'taller', accion: 'export' },
      ],
    });
    const { result } = renderHook(useWorkshopCostReportDownload, { wrapper });
    act(() => result.current.download('pdf', filters));
    expect(api.get).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
  it('closes the preopened tab on invalid binary data', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: new Blob(['<html>error</html>'], { type: 'text/html' }),
      headers: {},
    });
    const { result } = renderHook(useWorkshopCostReportDownload, { wrapper });
    act(() => result.current.download('pdf', filters));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(popup.close).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('reports blocked popups without starting a request', () => {
    vi.mocked(window.open).mockReturnValue(null);
    const { result } = renderHook(useWorkshopCostReportDownload, { wrapper });
    act(() => result.current.download('pdf', filters));
    expect(notifyError).toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });
});
