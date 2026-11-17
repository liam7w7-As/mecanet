import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { salesScopeEpochKey } from '../../lib/sales-access-cache';
import { useAuthStore } from '../../stores/auth.store';
import { notifyError } from '../../stores/toast.store';
import {
  commercialReviewFixture,
  workshopPerformanceFixture,
} from '../../test/fixtures/workshop-performance';
import {
  useWorkshopCommercialReview,
  useWorkshopPerformance,
  useWorkshopPerformanceDownload,
} from '../useWorkshopPerformance';

import type { UserPublic } from '../../stores/auth.store';
import type { Role, WorkshopPerformanceReport } from '@unithor/shared';
import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
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
  vehicleId: 5,
  catalogItemId: 3,
  workOrderItemId: 41,
  groupBy: 'week' as const,
};
const pdf = () =>
  ({
    data: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    headers: { 'content-type': 'application/pdf' },
  }) as AxiosResponse<Blob>;

describe('Confidential performance downloads', () => {
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
    const { result } = renderHook(useWorkshopPerformanceDownload, { wrapper });
    act(() => {
      result.current.download('pdf', filters);
      result.current.download('pdf', filters);
    });
    expect(window.open).toHaveBeenCalledOnce();
    expect(popup.opener).toBeNull();
    await waitFor(() => expect(popup.location.href).toBe('blob:cost-report'));
    expect(api.get).toHaveBeenCalledOnce();
    expect(api.get).toHaveBeenCalledWith('/reports/workshop-costs/analysis/pdf', {
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
    const { result } = renderHook(useWorkshopPerformanceDownload, { wrapper });
    act(() => result.current.download('excel', filters));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce());
    expect(api.get).toHaveBeenCalledWith('/reports/workshop-costs/analysis/excel', {
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
      const { result } = renderHook(useWorkshopPerformanceDownload, { wrapper });
      act(() => result.current.download('pdf', filters));
      await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
      act(() => {
        if (cause === 'logout') useAuthStore.getState().setUser(null);
        else if (cause === 'scope') client.setQueryData(salesScopeEpochKey, 1);
        else if (cause === 'identity')
          useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, id: 2 });
        else
          useAuthStore.getState().setUser({
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
    const { result } = renderHook(useWorkshopPerformanceDownload, { wrapper });
    act(() => result.current.download('pdf', filters));
    expect(api.get).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
  it('closes the preopened tab on invalid binary data', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: new Blob(['<html>error</html>'], { type: 'text/html' }),
      headers: {},
    });
    const { result } = renderHook(useWorkshopPerformanceDownload, { wrapper });
    act(() => result.current.download('pdf', filters));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(popup.close).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('reports blocked popups without starting a request', () => {
    vi.mocked(window.open).mockReturnValue(null);
    const { result } = renderHook(useWorkshopPerformanceDownload, { wrapper });
    act(() => result.current.download('pdf', filters));
    expect(notifyError).toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });
  it('requires read and export in the same module and rejects ranges beyond 366 days', () => {
    useAuthStore.getState().setUser({
      ...useAuthStore.getState().user!,
      permissions: [
        { modulo: 'taller', accion: 'read' },
        { modulo: 'finanzas', accion: 'export' },
      ],
    });
    const { result } = renderHook(useWorkshopPerformanceDownload, { wrapper });
    act(() => result.current.download('pdf', filters));
    useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, permissions: undefined });
    act(() => result.current.download('excel', { ...filters, fechaDesde: '2025-01-01' }));
    expect(api.get).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe('Workshop performance query and commercial reviews', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const login = (role: Role, permissions?: UserPublic['permissions'], id = 1) =>
    useAuthStore
      .getState()
      .setUser({ id, nombre: role, email: 'test@example.invalid', role, permissions });
  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    login('jefe');
    vi.mocked(api.get).mockResolvedValue({ data: workshopPerformanceFixture });
    vi.mocked(api.post).mockResolvedValue({ data: { review: commercialReviewFixture } });
  });
  afterEach(() => client.clear());

  it.each(['admin', 'desarrollador', 'jefe', 'finanzas'] as const)(
    'reads analysis for %s with the complete validated filter set',
    async (role) => {
      login(role);
      const { result } = renderHook(() => useWorkshopPerformance(filters), { wrapper });
      await waitFor(() => expect(result.current.data).toEqual(workshopPerformanceFixture));
      expect(api.get).toHaveBeenCalledWith(
        '/reports/workshop-costs/analysis',
        expect.objectContaining({ params: filters, signal: expect.any(AbortSignal) }),
      );
    },
  );
  it.each(['mecanico', 'vendedor', 'bodeguero'] as const)(
    'denies query and forced refetch to %s despite manual grants',
    async (role) => {
      login(role, [
        { modulo: 'taller', accion: 'read' },
        { modulo: 'finanzas', accion: 'read' },
      ]);
      const { result } = renderHook(() => useWorkshopPerformance(filters), { wrapper });
      expect(result.current.allowed).toBe(false);
      await act(async () => {
        await result.current.refetch();
      });
      expect(result.current.data).toBeUndefined();
      expect(api.get).not.toHaveBeenCalled();
    },
  );
  it.each([
    { fechaDesde: '2026-11-03' },
    { fechaDesde: '2025-01-01' },
    { vehicleId: 0 },
    { catalogItemId: -1 },
    { workOrderItemId: 1.5 },
    { fechaHasta: '2026-02-30' },
  ])('blocks invalid filters even on manual refetch: %o', async (invalid) => {
    const { result } = renderHook(() => useWorkshopPerformance({ ...filters, ...invalid }), {
      wrapper,
    });
    expect(result.current.valid).toBe(false);
    await act(async () => {
      await result.current.refetch();
    });
    expect(api.get).not.toHaveBeenCalled();
  });
  it('accepts the 366-day boundary and keys regrouped requests independently', async () => {
    const { result, rerender } = renderHook(
      ({ groupBy }: { groupBy: 'day' | 'month' }) =>
        useWorkshopPerformance({
          ...filters,
          fechaDesde: '2025-11-01',
          fechaHasta: '2026-11-02',
          groupBy,
        }),
      { wrapper, initialProps: { groupBy: 'day' } },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ groupBy: 'month' });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get).toHaveBeenLastCalledWith(
      '/reports/workshop-costs/analysis',
      expect.objectContaining({ params: expect.objectContaining({ groupBy: 'month' }) }),
    );
  });
  it.each(['permission', 'scope', 'identity'] as const)(
    'discards an in-flight analysis after %s changes',
    async (cause) => {
      let finish: ((response: AxiosResponse<WorkshopPerformanceReport>) => void) | undefined;
      vi.mocked(api.get).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const { result } = renderHook(() => useWorkshopPerformance(filters), { wrapper });
      await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
      act(() => {
        if (cause === 'permission') login('jefe', []);
        else if (cause === 'scope') client.setQueryData(salesScopeEpochKey, 1);
        else {
          vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
          login('jefe', undefined, 2);
        }
      });
      await act(async () =>
        finish?.({ data: workshopPerformanceFixture } as AxiosResponse<WorkshopPerformanceReport>),
      );
      expect(result.current.data).toBeUndefined();
    },
  );
  it.each(['jefe', 'admin', 'desarrollador'] as const)(
    'creates append-only reviews for %s, trimming only the contract payload',
    async (role) => {
      login(role);
      const invalidation = vi.spyOn(client, 'invalidateQueries');
      const { result } = renderHook(useWorkshopCommercialReview, { wrapper });
      await act(async () => {
        await result.current.mutateAsync({
          workOrderItemId: 41,
          reason: 'descuento',
          note: '  Acuerdo autorizado  ',
        });
      });
      expect(api.post).toHaveBeenCalledWith('/reports/workshop-costs/commercial-reviews', {
        workOrderItemId: 41,
        reason: 'descuento',
        note: 'Acuerdo autorizado',
      });
      await waitFor(() => expect(result.current.data).toEqual(commercialReviewFixture));
      expect(invalidation).toHaveBeenCalledWith({ queryKey: ['reports', 'workshop-performance'] });
    },
  );
  it.each(['finanzas', 'mecanico', 'vendedor'] as const)(
    'never grants review writes to %s with manual taller update',
    async (role) => {
      login(role, [
        { modulo: 'taller', accion: 'read' },
        { modulo: 'taller', accion: 'update' },
      ]);
      const { result } = renderHook(useWorkshopCommercialReview, { wrapper });
      expect(result.current.allowed).toBe(false);
      await act(async () => {
        await expect(
          result.current.mutateAsync({ workOrderItemId: 41, reason: 'otro', note: 'Texto' }),
        ).rejects.toThrow('no autorizada');
      });
      expect(api.post).not.toHaveBeenCalled();
    },
  );
  it('requires taller update for the workshop chief and checks rights at submit time', async () => {
    const { result } = renderHook(useWorkshopCommercialReview, { wrapper });
    act(() => login('jefe', [{ modulo: 'taller', accion: 'read' }]));
    await act(async () => {
      await expect(
        result.current.mutateAsync({ workOrderItemId: 41, reason: 'otro', note: 'Texto' }),
      ).rejects.toThrow('no autorizada');
    });
    expect(api.post).not.toHaveBeenCalled();
  });
  it('rejects malformed review input before POST and never automatically retries writes', async () => {
    const { result } = renderHook(useWorkshopCommercialReview, { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          workOrderItemId: 41,
          reason: 'otro',
          note: '  ',
          referenceHourlyRate: 0,
        }),
      ).rejects.toThrow();
    });
    expect(api.post).not.toHaveBeenCalled();
    vi.mocked(api.post).mockRejectedValue(new Error('Offline'));
    await act(async () => {
      await expect(
        result.current.mutateAsync({ workOrderItemId: 41, reason: 'otro', note: 'Texto' }),
      ).rejects.toThrow('Offline');
    });
    expect(api.post).toHaveBeenCalledOnce();
  });
  it.each(['permission', 'scope', 'identity'] as const)(
    'does not deliver or cache a review completed after %s changes',
    async (cause) => {
      let finish:
        ((value: { data: { review: typeof commercialReviewFixture } }) => void) | undefined;
      vi.mocked(api.post).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const invalidation = vi.spyOn(client, 'invalidateQueries');
      const { result } = renderHook(useWorkshopCommercialReview, { wrapper });
      let pending: Promise<unknown>;
      act(() => {
        pending = result.current
          .mutateAsync({ workOrderItemId: 41, reason: 'otro', note: 'Texto' })
          .catch((error: unknown) => error);
      });
      await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
      act(() => {
        if (cause === 'permission') login('jefe', [{ modulo: 'taller', accion: 'read' }]);
        else if (cause === 'scope') client.setQueryData(salesScopeEpochKey, 1);
        else login('jefe', undefined, 2);
      });
      await act(async () => {
        finish?.({ data: { review: commercialReviewFixture } });
        await pending;
      });
      expect(result.current.data).toBeUndefined();
      expect(invalidation).not.toHaveBeenCalled();
    },
  );
});
