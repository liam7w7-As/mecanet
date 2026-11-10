import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import {
  confirmImport,
  previewImport,
  useConfirmImportMutation,
  useImportWarehouses,
  usePreviewImportMutation,
} from '../useImports';

import type { UserPublic } from '../../stores/auth.store';
import type { ImportTarget } from '../useImports';
import type { ImportPreview, ImportResult } from '@unithor/shared';
import type { InternalAxiosRequestConfig } from 'axios';
import type { ReactNode } from 'react';

const admin: UserPublic = { id: 1, role: 'admin', nombre: 'Admin', email: 'admin@example.test' };
const preview: ImportPreview = {
  module: 'catalog', fileName: 'catalogo.xlsx', sheetName: 'Datos', headerRow: 1,
  headers: [], mappedColumns: {}, missingColumns: [], totalRows: 2, validRows: 2,
  duplicateRows: 0, errorRows: 0, rows: [], truncated: false, maxRows: 1_000,
  newRows: 1, updateRows: 1, previewToken: 'token-revisado', warehouseId: 7,
};
const applied: ImportResult = {
  ...preview, previewToken: undefined, created: 1, updated: 1, skipped: 0, failed: 0, clientsCreated: 0,
};
const response = (config: InternalAxiosRequestConfig, data: unknown) => ({
  data, config, status: 200, statusText: 'OK', headers: {},
});
const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
  response(config, config.url?.includes('dryRun=true') ? { preview } : { result: applied }),
);
const originalAdapter = api.defaults.adapter;

describe('Import HTTP y caché', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    useAuthStore.setState({ user: admin });
    adapter.mockReset();
    adapter.mockImplementation(async (config) =>
      response(config, config.url?.includes('dryRun=true') ? { preview } : { result: applied }),
    );
    // Exercise the actual Axios instance, transformations and interceptors without a network request.
    api.defaults.adapter = adapter;
  });

  afterEach(() => {
    client.clear();
    api.defaults.adapter = originalAdapter;
  });

  it.each<ImportTarget>(['catalog', 'vehicles', 'fleet-vehicles'])(
    '%s envía el mismo archivo y almacén; solo confirmar lleva X-Import-Preview',
    async (target) => {
      const file = new File(['xlsx'], 'catalogo.xlsx');
      const { result } = renderHook(() => ({
        preview: usePreviewImportMutation(target), confirm: useConfirmImportMutation(target),
      }), { wrapper });

      await act(async () => {
        await result.current.preview.mutateAsync({ file, warehouseId: 7 });
      });
      await waitFor(() => expect(result.current.preview.data).toEqual(preview));
      const before = adapter.mock.calls[0]![0];
      expect(before.method).toBe('post');
      expect(before.url).toBe(`/${target}/import?dryRun=true&warehouseId=7`);
      expect((before.data as FormData).get('file')).toBe(file);
      expect(before.headers.get('X-Import-Preview')).toBeUndefined();

      await act(async () => {
        await result.current.confirm.mutateAsync({ file, warehouseId: 7, previewToken: result.current.preview.data?.previewToken });
      });
      const confirm = adapter.mock.calls[1]![0];
      expect(confirm.method).toBe('post');
      expect(confirm.url).toBe(`/${target}/import?warehouseId=7`);
      expect((confirm.data as FormData).get('file')).toBe(file);
      expect(confirm.headers.get('X-Import-Preview')).toBe('token-revisado');
      expect(confirm.params).toBeUndefined();
    },
  );

  it('mantiene los helpers sin almacén y no agrega valores undefined a la URL', async () => {
    const file = new File(['xlsx'], 'datos.xlsx');
    expect(await previewImport('catalog', file)).toEqual(preview);
    expect(await confirmImport('catalog', file, { previewToken: 'token-revisado' })).toEqual(applied);
    expect(adapter.mock.calls[0]![0].url).toBe('/catalog/import?dryRun=true');
    expect(adapter.mock.calls[1]![0].url).toBe('/catalog/import');
    expect(adapter.mock.calls[1]![0].headers.get('X-Import-Preview')).toBe('token-revisado');
  });

  it.each([
    { target: 'catalog' as const, keys: [['catalog', 'list'], ['warehouses', 'balances', 7], ['dashboard']] },
    { target: 'vehicles' as const, keys: [['vehicles', 'list'], ['clients', 'list'], ['dashboard']] },
    { target: 'fleet-vehicles' as const, keys: [['fleet-vehicles', 'list'], ['dashboard']] },
  ])('invalida las consultas existentes de $target al aplicar', async ({ target, keys }) => {
    for (const key of keys) client.setQueryData(key, { cached: true });
    client.setQueryData(['unrelated'], { cached: true });
    const { result } = renderHook(() => useConfirmImportMutation(target), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ file: new File(['xlsx'], 'datos.xlsx'), previewToken: 'token-revisado' });
    });
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
  });

  it('propaga el 409 IMPORT_PREVIEW_CHANGED sin reintentar ni invalidar caché', async () => {
    adapter.mockImplementation(async (config) => {
      throw new AxiosError('Vista previa obsoleta', 'ERR_BAD_REQUEST', config, undefined, {
        ...response(config, { error: { code: 'IMPORT_PREVIEW_CHANGED' } }), status: 409,
      });
    });
    client.setQueryData(['catalog'], { cached: true });
    const { result } = renderHook(() => useConfirmImportMutation('catalog'), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({
        file: new File(['xlsx'], 'datos.xlsx'), previewToken: 'obsoleto',
      })).rejects.toMatchObject({ response: { status: 409, data: { error: { code: 'IMPORT_PREVIEW_CHANGED' } } } });
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(['catalog'])?.isInvalidated).toBe(false);
  });

  it.each([
    { label: 'sin sesión', user: null, enabled: true },
    { label: 'sin permiso de lectura', user: { ...admin, role: 'mecanico', permissions: [] }, enabled: true },
    { label: 'con permisos personalizados que excluyen lectura', user: { ...admin, role: 'vendedor', permissions: [{ modulo: 'almacen', accion: 'create' }] }, enabled: true },
    { label: 'en otros módulos', user: admin, enabled: false },
  ] satisfies { label: string; user: UserPublic | null; enabled: boolean }[])(
    'no consulta almacenes $label, incluso al invalidar la caché', async ({ user, enabled }) => {
      useAuthStore.setState({ user });
      const { result } = renderHook(() => useImportWarehouses(enabled), { wrapper });
      await act(async () => { await client.invalidateQueries({ queryKey: ['warehouses'] }); });
      expect(result.current.fetchStatus).toBe('idle');
      expect(adapter).not.toHaveBeenCalled();
    },
  );

  it('consulta almacenes activos con permiso explícito y carga las páginas restantes', async () => {
    useAuthStore.setState({ user: { ...admin, role: 'mecanico', permissions: [{ modulo: 'almacen', accion: 'read' }] } });
    adapter.mockImplementation(async (config) => response(config, {
      items: [{ id: config.params.page, codigo: `ALM-${config.params.page}`, nombre: 'Almacén' }],
      page: config.params.page, pageSize: 100, total: 101, totalPages: 2,
    }));
    const { result } = renderHook(() => useImportWarehouses(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((warehouse) => warehouse.id)).toEqual([1, 2]);
    expect(adapter).toHaveBeenCalledTimes(2);
    for (const [index, [config]] of adapter.mock.calls.entries()) {
      expect(config.method).toBe('get');
      expect(config.url).toBe('/warehouses');
      expect(config.params).toEqual({ page: index + 1, pageSize: 100, soloActivos: true });
    }
  });
});
