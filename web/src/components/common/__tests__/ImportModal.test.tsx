import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ImportModal from '../ImportModal';

import type { ImportPreview, ImportResult } from '@unithor/shared';

const mocks = vi.hoisted(() => ({
  downloadImportTemplate: vi.fn(),
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
}));

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
  ...overrides,
});

const buildResult = (overrides: Partial<ImportResult> = {}): ImportResult => ({
  ...buildPreview(),
  created: 1,
  skipped: 1,
  failed: 0,
  clientsCreated: 0,
  ...overrides,
});

const selectFile = (file: File): void => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No se encontró el input de archivo');
  fireEvent.change(input, { target: { files: [file] } });
};

describe('ImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.previewMutation.isPending = false;
    mocks.confirmMutation.isPending = false;
  });

  it('muestra el contexto del módulo y descarga la plantilla', async () => {
    render(<ImportModal target="catalog" onClose={vi.fn()} />);

    expect(
      screen.getByRole('dialog', { name: 'Importar catálogo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nunca se sobrescriben precios ni stock/i),
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

    selectFile(new File(['xlsx'], 'catalogo.xlsx'));

    await waitFor(() => {
      expect(mocks.previewMutation.mutate).toHaveBeenCalledTimes(1);
    });
    expect(mocks.previewMutation.mutate.mock.calls[0]?.[0]).toBeInstanceOf(File);

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
  });

  it('identifica el módulo de flota en el título', () => {
    render(<ImportModal target="fleet-vehicles" onClose={vi.fn()} />);

    expect(
      screen.getByRole('dialog', { name: 'Importar vehículos de flota' }),
    ).toBeInTheDocument();
  });
});
