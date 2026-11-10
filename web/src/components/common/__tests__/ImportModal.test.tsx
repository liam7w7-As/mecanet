import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/auth.store';
import ImportModal from '../ImportModal';

import type { ImportPreview, ImportResult } from '@unithor/shared';

const mocks = vi.hoisted(() => ({
  downloadImportTemplate: vi.fn(),
  notifySuccess: vi.fn(),
  warehousesQuery: {
    data: [{ id: 7, codigo: 'PRIN', nombre: 'Principal' }],
    isLoading: false,
    isError: false,
  },
  previewMutation: {
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  },
  confirmMutation: {
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('../../../hooks/useImports', () => ({
  downloadImportTemplate: mocks.downloadImportTemplate,
  usePreviewImportMutation: () => mocks.previewMutation,
  useConfirmImportMutation: () => mocks.confirmMutation,
  useImportWarehouses: () => mocks.warehousesQuery,
}));

vi.mock('../../../stores/toast.store', () => ({ notifySuccess: mocks.notifySuccess }));

const buildPreview = (overrides: Partial<ImportPreview> = {}): ImportPreview => ({
  module: 'catalog',
  fileName: 'catalogo.xlsx',
  sheetName: 'Datos',
  headerRow: 1,
  headers: ['Código', 'Nombre', 'Precio', 'Stock'],
  mappedColumns: { codigo: 'Código', nombre: 'Nombre' },
  missingColumns: [],
  totalRows: 2,
  validRows: 1,
  duplicateRows: 1,
  errorRows: 0,
  rows: [
    {
      row: 2,
      status: 'valid',
      label: 'REP-001 · Filtro de aceite',
      values: {},
      messages: [],
    },
    {
      row: 3,
      status: 'duplicate',
      label: 'REP-002 · Filtro de aire',
      values: {},
      messages: ['Ya existe un registro con ese código; se omitirá.'],
    },
  ],
  truncated: false,
  maxRows: 1_000,
  previewToken: 'preview-original',
  ...overrides,
});

const buildResult = (overrides: Partial<ImportResult> = {}): ImportResult => ({
  ...buildPreview(),
  previewToken: undefined,
  created: 1,
  updated: 0,
  skipped: 1,
  failed: 0,
  clientsCreated: 0,
  rows: buildPreview().rows.map((row) => ({ ...row, status: row.status === 'valid' ? 'created' : row.status })),
  ...overrides,
});

const selectFile = (file: File): void => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No se encontró el input de archivo');
  fireEvent.change(input, { target: { files: [file] } });
};

describe('ImportModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.previewMutation.isPending = false;
    mocks.confirmMutation.isPending = false;
    mocks.warehousesQuery.isLoading = false;
    mocks.warehousesQuery.isError = false;
    useAuthStore.setState({
      user: { id: 1, role: 'mecanico', nombre: 'Prueba', email: 'test@example.test', permissions: [] },
    });
  });

  it('muestra el contexto del módulo y descarga la plantilla', async () => {
    render(<ImportModal target="catalog" onClose={vi.fn()} />);

    expect(
      screen.getByRole('dialog', { name: 'Importar catálogo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Revisa los registros nuevos y los cambios/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Descargar plantilla/i }));

    await waitFor(() => {
      expect(mocks.downloadImportTemplate).toHaveBeenCalledWith('catalog');
    });
  });

  it('rechaza archivos que no son Excel .xlsx sin llamar al servidor', () => {
    render(<ImportModal target="catalog" onClose={vi.fn()} />);

    selectFile(new File(['nombre,precio'], 'catalogo.csv', { type: 'text/csv' }));

    expect(screen.getByRole('alert')).toHaveTextContent('El archivo debe ser un Excel .xlsx');
    expect(mocks.previewMutation.mutate).not.toHaveBeenCalled();
  });

  it('previsualiza el archivo y resume válidos, omitidos y errores', async () => {
    const preview = buildPreview();
    mocks.previewMutation.mutate.mockImplementation((_file, options) => {
      options.onSuccess(preview);
    });
    render(<ImportModal target="catalog" onClose={vi.fn()} />);

    const file = new File(['xlsx'], 'catalogo.xlsx');
    selectFile(file);

    await waitFor(() => {
      expect(mocks.previewMutation.mutate).toHaveBeenCalledTimes(1);
    });
    expect(mocks.previewMutation.mutate.mock.calls[0]?.[0]).toEqual({ file, warehouseId: undefined });

    expect(await screen.findByText('Vista previa')).toBeInTheDocument();
    expect(screen.getByText('REP-001 · Filtro de aceite')).toBeInTheDocument();
    expect(screen.getByText('REP-002 · Filtro de aire')).toBeInTheDocument();
    expect(screen.getByText(/Ya existe un registro con ese código/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Importar 1 registro' }),
    ).toBeEnabled();
  });

  it('solo permite confirmar cuando hay filas válidas', async () => {
    const preview = buildPreview({ validRows: 0, duplicateRows: 2, rows: [] });
    mocks.previewMutation.mutate.mockImplementation((_file, options) => {
      options.onSuccess(preview);
    });
    render(<ImportModal target="catalog" onClose={vi.fn()} />);

    selectFile(new File(['xlsx'], 'catalogo.xlsx'));

    await waitFor(() => expect(screen.getByText('Vista previa')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Importar 0 registros' })).toBeDisabled();
  });

  it('confirma la importación y muestra el resultado final', async () => {
    mocks.previewMutation.mutate.mockImplementation((_file, options) => {
      options.onSuccess(buildPreview());
    });
    mocks.confirmMutation.mutate.mockImplementation((_file, options) => {
      options.onSuccess(buildResult());
    });
    render(<ImportModal target="catalog" onClose={vi.fn()} />);

    selectFile(new File(['xlsx'], 'catalogo.xlsx'));
    fireEvent.click(await screen.findByRole('button', { name: 'Importar 1 registro' }));

    await waitFor(() => {
      expect(mocks.confirmMutation.mutate).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Importación completada')).toBeInTheDocument();
    expect(screen.getByText('Creados')).toBeInTheDocument();
    expect(screen.getByText('Actualizados')).toBeInTheDocument();
    expect(mocks.confirmMutation.mutate.mock.calls[0]?.[0]).toEqual({
      file: expect.any(File), warehouseId: undefined, previewToken: 'preview-original',
    });
    expect(mocks.notifySuccess).toHaveBeenCalledWith('Catálogo importado: 1 registro creado y 0 actualizados.');
    expect(screen.getByText('Omitidos')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Importar otro archivo/i }).length,
    ).toBeGreaterThan(0);
  });

  it('informa el error cuando la vista previa del servidor falla', async () => {
    mocks.previewMutation.mutate.mockImplementation((_file, options) => {
      options.onError(new Error('falló'));
    });
    render(<ImportModal target="catalog" onClose={vi.fn()} />);

    selectFile(new File(['xlsx'], 'catalogo.xlsx'));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('catalogo.xlsx')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar vista previa' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
  });

  it('muestra conteos globales, estados, ID y cambios antes → después', () => {
    const row = buildPreview().rows[0]!;
    mocks.previewMutation.mutate.mockImplementation((_input, options) => options.onSuccess(buildPreview({
      totalRows: 6, validRows: 2, newRows: 1, updateRows: 1, unchangedRows: 1, conflictRows: 1, errorRows: 1,
      rows: [
        row,
        { ...row, row: 3, status: 'update', existingId: 42, label: 'Repuesto existente', changes: [
          { field: 'precio', label: 'Precio', before: 100, after: 125 },
          { field: 'stock', label: 'Stock', before: 5, after: 0 },
          { field: 'codigo', label: 'Código', before: null, after: 'REP-002' },
        ] },
        { ...row, row: 4, status: 'unchanged', label: 'Sin modificaciones' },
        { ...row, row: 5, status: 'conflict', label: 'Stock sin almacén', messages: ['Selecciona un almacén para aplicar el stock.'] },
        { ...row, row: 6, status: 'duplicate', label: 'Repetido' },
        { ...row, row: 7, status: 'error', label: 'Inválido', messages: ['Precio inválido.'] },
      ],
    })));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    selectFile(new File(['xlsx'], 'catalogo.xlsx'));

    for (const label of ['Nuevos', 'Actualizar', 'Sin cambios', 'Conflictos', 'Errores']) {
      const summary = screen.getAllByText(label)[0]!.parentElement;
      expect(summary).toHaveTextContent('1');
    }
    const table = within(screen.getByRole('table'));
    for (const status of ['Nuevo', 'Actualizar', 'Sin cambios', 'Conflicto', 'Duplicado', 'Error']) {
      expect(table.getByText(status)).toBeInTheDocument();
    }
    expect(table.getByText('ID existente: 42')).toBeInTheDocument();
    const changes = within(screen.getByRole('list', { name: 'Cambios de la fila 3' }));
    expect(changes.getByText('Precio').parentElement).toHaveTextContent('100→125');
    expect(changes.getByText('Stock').parentElement).toHaveTextContent('5→0');
    expect(changes.getByText('Código').parentElement).toHaveTextContent('Sin valor→REP-002');
    expect(table.getByText('Selecciona un almacén para aplicar el stock.')).toBeInTheDocument();
    expect(screen.getByText(/no se suma/)).toHaveTextContent(/Un 0 explícito.*celda vacía/);
  });

  it('advierte que solo muestra 200 filas y usa los conteos de todo el archivo', () => {
    const row = buildPreview().rows[0]!;
    mocks.previewMutation.mutate.mockImplementation((_input, options) => options.onSuccess(buildPreview({
      totalRows: 225, validRows: 225, newRows: 225, duplicateRows: 0,
      rows: Array.from({ length: 200 }, (_, index) => ({ ...row, row: index + 2 })),
    })));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    selectFile(new File(['xlsx'], 'catalogo.xlsx'));

    expect(screen.getByText(/Se muestran las primeras 200 de 225 filas/)).toHaveTextContent(/incluyen todas las filas/);
    expect(screen.getByText('Nuevos').parentElement).toHaveTextContent('225');
    expect(screen.getByRole('button', { name: 'Importar 225 registros' })).toBeEnabled();
  });

  it('impide confirmar una vista previa sin token, aunque tenga filas válidas', () => {
    mocks.previewMutation.mutate.mockImplementation((_input, options) => options.onSuccess(buildPreview({ previewToken: undefined })));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    selectFile(new File(['xlsx'], 'catalogo.xlsx'));

    const confirm = screen.getByRole('button', { name: 'Importar 1 registro' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mocks.confirmMutation.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Genera una nueva vista previa');
  });

  it('rechaza confirmar una planilla truncada por el límite de filas', () => {
    mocks.previewMutation.mutate.mockImplementation((_input, options) => options.onSuccess(buildPreview({ truncated: true })));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    selectFile(new File(['xlsx'], 'catalogo.xlsx'));
    expect(screen.getByRole('button', { name: 'Importar 1 registro' })).toBeDisabled();
    expect(screen.getByText(/Divide la planilla/)).toBeInTheDocument();
  });

  it('invalida la vista previa al cambiar almacén y confirma solo con la nueva revisión', () => {
    useAuthStore.setState({ user: { id: 1, role: 'admin', nombre: 'Admin', email: 'admin@example.test' } });
    mocks.previewMutation.mutate
      .mockImplementationOnce((_input, options) => options.onSuccess(buildPreview()))
      .mockImplementationOnce((_input, options) => options.onSuccess(buildPreview({ previewToken: 'preview-almacen', warehouseId: 7 })));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    const file = new File(['xlsx'], 'catalogo.xlsx');
    selectFile(file);
    expect(screen.getByLabelText('Archivo Excel').closest('label')).toHaveClass('import-dropzone--selected');

    const warehouse = screen.getByRole('combobox', { name: 'Almacén para el stock (opcional)' });
    fireEvent.change(warehouse, { target: { value: '7' } });
    expect(screen.queryByText('Vista previa')).not.toBeInTheDocument();
    expect(screen.getByText('catalogo.xlsx')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
    fireEvent.change(warehouse, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
    fireEvent.change(warehouse, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar vista previa' }));

    expect(mocks.previewMutation.mutate.mock.lastCall?.[0]).toEqual({ file, warehouseId: 7 });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 registro' }));
    expect(mocks.confirmMutation.mutate.mock.lastCall?.[0]).toEqual({ file, warehouseId: 7, previewToken: 'preview-almacen' });
  });

  it('conserva el archivo tras 409 y exige una nueva vista previa antes de confirmar', () => {
    mocks.previewMutation.mutate
      .mockImplementationOnce((_input, options) => options.onSuccess(buildPreview()))
      .mockImplementationOnce((_input, options) => options.onSuccess(buildPreview({ previewToken: 'preview-renovado' })));
    mocks.confirmMutation.mutate.mockImplementationOnce((_input, options) => options.onError({
      isAxiosError: true,
      response: { status: 409, data: { error: { code: 'IMPORT_PREVIEW_CHANGED', message: 'Cambió el registro.' } } },
    }));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    const file = new File(['xlsx'], 'catalogo.xlsx');
    selectFile(file);
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 registro' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Genera una nueva vista previa');
    expect(screen.getByText('catalogo.xlsx')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Importar' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mocks.confirmMutation.mutate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Generar vista previa' }));
    expect(mocks.previewMutation.mutate.mock.lastCall?.[0].file).toBe(file);
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 registro' }));
    expect(mocks.confirmMutation.mutate.mock.lastCall?.[0]).toEqual({ file, warehouseId: undefined, previewToken: 'preview-renovado' });
  });

  it('descarta respuestas tardías del archivo anterior', () => {
    mocks.previewMutation.mutate.mockImplementationOnce(() => undefined)
      .mockImplementationOnce((_input, options) => options.onSuccess(buildPreview({ previewToken: 'segundo-archivo' })));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    selectFile(new File(['primero'], 'anterior.xlsx'));
    const previous = mocks.previewMutation.mutate.mock.calls[0]![1];
    const file = new File(['segundo'], 'nuevo.xlsx');
    selectFile(file);
    act(() => previous.onSuccess(buildPreview({ previewToken: 'obsoleto' })));
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 registro' }));
    expect(mocks.confirmMutation.mutate.mock.lastCall?.[0]).toEqual({ file, warehouseId: undefined, previewToken: 'segundo-archivo' });
  });

  it('invalida la revisión cuando cambia el usuario y no revive una respuesta anterior', () => {
    mocks.previewMutation.mutate.mockImplementation((_input, options) => options.onSuccess(buildPreview()));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    selectFile(new File(['xlsx'], 'catalogo.xlsx'));
    const previous = mocks.previewMutation.mutate.mock.calls[0]![1];
    act(() => useAuthStore.setState({ user: { id: 2, role: 'mecanico', nombre: 'Otro', email: 'other@example.test' } }));
    act(() => previous.onSuccess(buildPreview()));
    expect(screen.queryByText('Vista previa')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
  });

  it('muestra los estados aplicados y notifica creados y actualizados', () => {
    mocks.previewMutation.mutate.mockImplementation((_input, options) => options.onSuccess(buildPreview()));
    const row = buildPreview().rows[0]!;
    mocks.confirmMutation.mutate.mockImplementation((_input, options) => options.onSuccess(buildResult({
      updated: 2, rows: [{ ...row, status: 'created' }, { ...row, row: 3, status: 'updated', existingId: 10 }],
    })));
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    selectFile(new File(['xlsx'], 'catalogo.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 registro' }));
    expect(within(screen.getByRole('table')).getByText('Creado')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Actualizado')).toBeInTheDocument();
    expect(mocks.notifySuccess).toHaveBeenCalledWith('Catálogo importado: 1 registro creado y 2 actualizados.');
  });

  it('oculta el selector sin permiso de lectura de almacén', () => {
    render(<ImportModal target="catalog" onClose={vi.fn()} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('identifica el módulo de flota en el título', () => {
    render(<ImportModal target="fleet-vehicles" onClose={vi.fn()} />);

    expect(
      screen.getByRole('dialog', { name: 'Importar vehículos de flota' }),
    ).toBeInTheDocument();
  });
});
