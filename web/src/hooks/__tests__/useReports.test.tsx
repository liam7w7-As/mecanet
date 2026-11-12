import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { getApiErrorMessage } from '../../lib/api-error';
import { salesScopeEpochKey } from '../../lib/sales-access-cache';
import { useAuthStore } from '../../stores/auth.store';
import { useReportDownload } from '../useReports';

import type { AxiosResponse } from 'axios';
import type { ReactNode } from 'react';

vi.mock('../../lib/api', () => ({ api: { get: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn() }));
vi.mock('../../stores/toast.store', () => ({ notifyError: vi.fn() }));
const filters = { fechaDesde: '2026-11-01', fechaHasta: '2026-11-12', workOrderLinked: false };
const pdf = () => ({ data: new Blob(['%PDF-1.7'], { type: 'application/pdf' }), headers: { 'content-type': 'application/pdf' } } as AxiosResponse<Blob>);

describe('Report downloads with current permissions and real binary responses', () => {
  let client: QueryClient;
  let popup: { location: { href: string }; close: ReturnType<typeof vi.fn>; closed: boolean; opener: Window | null };
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    useAuthStore.getState().setUser({ id: 2, nombre: 'Vendedor', email: 'vendedor@test.local', role: 'vendedor' });
    popup = { location: { href: '' }, close: vi.fn(), closed: false, opener: window };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:report-verified') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(api.get).mockResolvedValue(pdf());
  });
  afterEach(() => { client.clear(); vi.restoreAllMocks(); });

  it('preopens one tab and delivers the PDF with the exact filters', async () => {
    const { result } = renderHook(useReportDownload, { wrapper });
    act(() => { result.current.openPdf('commercial', filters); result.current.openPdf('commercial', filters); });
    expect(window.open).toHaveBeenCalledOnce();
    expect(popup.opener).toBeNull();
    await waitFor(() => expect(popup.location.href).toBe('blob:report-verified'));
    expect(api.get).toHaveBeenCalledOnce();
    expect(api.get).toHaveBeenCalledWith('/reports/commercial/pdf', { params: filters, responseType: 'blob' });
  });

  it.each(['permission', 'scope', 'logout'] as const)('discards an in-flight PDF after a %s change', async (cause) => {
    let finish: ((response: AxiosResponse<Blob>) => void) | undefined;
    vi.mocked(api.get).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(useReportDownload, { wrapper });
    act(() => result.current.openPdf('commercial', filters));
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    act(() => {
      if (cause === 'scope') client.setQueryData(salesScopeEpochKey, 1);
      else if (cause === 'logout') useAuthStore.getState().setUser(null);
      else useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, permissions: [{ modulo: 'comercial', accion: 'read' }] });
    });
    await act(async () => { finish?.(pdf()); });
    await waitFor(() => expect(popup.close).toHaveBeenCalledOnce());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('keeps a download when the same effective user is refreshed', async () => {
    let finish: ((response: AxiosResponse<Blob>) => void) | undefined;
    vi.mocked(api.get).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(useReportDownload, { wrapper });
    act(() => result.current.openPdf('commercial', filters));
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    act(() => useAuthStore.getState().setUser({ ...useAuthStore.getState().user! }));
    await act(async () => { finish?.(pdf()); });
    await waitFor(() => expect(popup.location.href).toBe('blob:report-verified'));
  });

  it('does not request a PDF when popups are blocked', () => {
    vi.mocked(window.open).mockReturnValue(null);
    const { result } = renderHook(useReportDownload, { wrapper });
    act(() => result.current.openPdf('commercial', filters));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('rejects an HTML fallback instead of opening it as a report', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: new Blob(['<html>fallback</html>'], { type: 'text/html' }), headers: { 'content-type': 'text/html' } } as AxiosResponse<Blob>);
    const { result } = renderHook(useReportDownload, { wrapper });
    act(() => result.current.openPdf('commercial', filters));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getApiErrorMessage(result.current.error)).toContain('PDF válido');
    expect(popup.close).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows the API error from a binary download and closes the blank tab', async () => {
    const blob = new Blob(['error'], { type: 'application/json' });
    Object.defineProperty(blob, 'text', { value: async () => JSON.stringify({ error: { message: 'El reporte no puede abarcar más de 366 días' } }) });
    vi.mocked(api.get).mockRejectedValueOnce(new AxiosError('400', 'ERR_BAD_REQUEST', undefined, undefined, { status: 400, data: blob } as AxiosResponse<Blob>));
    const { result } = renderHook(useReportDownload, { wrapper });
    act(() => result.current.openPdf('commercial', filters));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getApiErrorMessage(result.current.error)).toBe('El reporte no puede abarcar más de 366 días');
    expect(popup.close).toHaveBeenCalledOnce();
  });
});
