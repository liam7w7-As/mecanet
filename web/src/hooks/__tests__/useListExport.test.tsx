import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ListExportButtons from '../../components/common/ListExportButtons';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { canExportList, listExportParams, useListExport } from '../useListExport';

import type { UserPublic } from '../../stores/auth.store';

const notifications = vi.hoisted(() => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock('../../stores/toast.store', () => notifications);
const admin: UserPublic = { id: 1, nombre: 'Admin', email: 'export@example.test', role: 'admin' };
const excelType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const excelResponse = () => ({
  data: new Blob(['xlsx'], { type: excelType }),
  headers: {
    'content-type': excelType,
    'content-disposition': 'attachment; filename="Listado.xlsx"',
  },
});
const popup = () => ({
  location: { href: 'about:blank' },
  closed: false,
  close: vi.fn(),
  opener: window,
});

describe('Exportación del listado con filtros y permisos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setUser(admin);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:export-prueba'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('omite paginación y conserva filtros false/0 sin aceptar identidad del actor en URL', () => {
    expect(
      listExportParams(
        {
          page: 5,
          pageSize: 2,
          search: 'Toyota',
          activo: false,
          stock: 0,
          role: 'admin',
          userId: 7,
          vacio: '',
          id: undefined,
        },
        false,
      ),
    ).toEqual({ search: 'Toyota', activo: false, stock: 0, includeOwner: false });
  });

  it.each([
    { permissions: [{ modulo: 'comercial', accion: 'read' }] },
    { permissions: [{ modulo: 'comercial', accion: 'export' }] },
    { permissions: [] },
  ] satisfies Array<{ permissions: NonNullable<UserPublic['permissions']> }>)(
    'exige lectura y exportación, sin recuperar permisos retirados del rol',
    ({ permissions }) => {
      const user: UserPublic = { ...admin, role: 'vendedor', permissions };
      expect(canExportList(user, 'quotations')).toBe(false);
      useAuthStore.getState().setUser(user);
      render(<ListExportButtons target="quotations" filters={{}} />);
      expect(
        screen.queryByRole('button', { name: 'Exportar listado a Excel' }),
      ).not.toBeInTheDocument();
    },
  );

  it('finanzas conserva el acceso de exportación comercial y flota exige su propio permiso', () => {
    const user: UserPublic = {
      ...admin,
      role: 'finanzas',
      permissions: [
        { modulo: 'comercial', accion: 'read' },
        { modulo: 'finanzas', accion: 'export' },
      ],
    };
    expect(canExportList(user, 'quotations')).toBe(true);
    expect(canExportList(user, 'fleet-vehicles')).toBe(false);
  });

  it('descarga Excel con los mismos filtros, todas las páginas y nombre sugerido', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(excelResponse());
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    const { result } = renderHook(() =>
      useListExport('catalog', { page: 5, search: 'Filtro', tipo: 'parte', soloConStock: true }),
    );
    await act(async () => result.current.exportList('excel'));
    expect(get).toHaveBeenCalledWith('/exports/catalog/excel', {
      params: { search: 'Filtro', tipo: 'parte', soloConStock: true },
      responseType: 'blob',
    });
    expect(downloads).toEqual(['Listado.xlsx']);
    expect(notifications.notifySuccess).toHaveBeenCalledOnce();
  });

  it('abre PDF en el clic antes de esperar al servidor y navega al blob', async () => {
    const pdf = popup();
    const open = vi.spyOn(window, 'open').mockReturnValue(pdf as unknown as Window);
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({
        data: new Blob(['%PDF-'], { type: 'application/pdf' }),
        headers: { 'content-type': 'application/pdf' },
      });
    const { result } = renderHook(() =>
      useListExport('fleet-vehicles', { estado: 'dado_de_baja' }, true),
    );
    await act(async () => result.current.exportList('pdf'));
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(get.mock.invocationCallOrder[0]);
    expect(get).toHaveBeenCalledWith('/exports/fleet-vehicles/pdf', {
      params: { estado: 'dado_de_baja', includeOwner: true },
      responseType: 'blob',
    });
    expect(pdf.location.href).toBe('blob:export-prueba');
    expect(pdf.opener).toBeNull();
  });

  it('no descarga si el navegador bloquea la pestaña PDF', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const get = vi.spyOn(api, 'get');
    const { result } = renderHook(() => useListExport('clients', {}));
    await act(async () => result.current.exportList('pdf'));
    expect(get).not.toHaveBeenCalled();
    expect(notifications.notifyError).toHaveBeenCalledWith(
      expect.stringContaining('pestañas emergentes'),
    );
  });

  it('muestra el error JSON recibido como blob y cierra la pestaña pendiente', async () => {
    const pdf = popup();
    vi.spyOn(window, 'open').mockReturnValue(pdf as unknown as Window);
    const blob = new Blob([], { type: 'application/json' });
    Object.defineProperty(blob, 'text', {
      value: async () =>
        JSON.stringify({ error: { message: 'Acota los filtros: demasiados registros.' } }),
    });
    vi.spyOn(api, 'get').mockRejectedValue(
      new AxiosError('Limit', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        statusText: 'Bad request',
        data: blob,
        headers: {},
        config: {} as never,
      }),
    );
    const { result } = renderHook(() => useListExport('clients', {}));
    await act(async () => result.current.exportList('pdf'));
    expect(pdf.close).toHaveBeenCalledOnce();
    expect(notifications.notifyError).toHaveBeenCalledWith(
      'Acota los filtros: demasiados registros.',
    );
  });

  it('bloquea ambos botones durante la descarga y no duplica peticiones', async () => {
    let finish!: (value: ReturnType<typeof excelResponse>) => void;
    const get = vi.spyOn(api, 'get').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<ListExportButtons target="clients" filters={{ tipo: 'empresa' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar listado a Excel' }));
    expect(screen.getByRole('button', { name: 'Exportar listado a PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar listado a Excel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar listado a Excel' }));
    await act(async () => finish(excelResponse()));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Exportar listado a Excel' })).toBeEnabled(),
    );
    expect(get).toHaveBeenCalledOnce();
  });

  it('descarta datos descargados si cambió el usuario mientras se generaban', async () => {
    let finish!: (value: ReturnType<typeof excelResponse>) => void;
    vi.spyOn(api, 'get').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useListExport('users', {}));
    let task!: Promise<void>;
    act(() => {
      task = result.current.exportList('excel');
    });
    act(() => useAuthStore.getState().setUser({ ...admin, id: 999 }));
    await act(async () => {
      finish(excelResponse());
      await task;
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(notifications.notifySuccess).not.toHaveBeenCalled();
  });
});
