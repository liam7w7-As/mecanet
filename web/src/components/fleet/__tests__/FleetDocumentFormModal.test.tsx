import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import FleetDocumentFormModal from '../FleetDocumentFormModal';

import type { FleetDocument } from '../../../types/entities';
import type { AxiosResponse } from 'axios';
import type { ComponentProps } from 'react';

vi.mock('../../../lib/api', () => ({
  api: { post: vi.fn(), patch: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const savedDocument: FleetDocument = {
  id: 11,
  fleetVehicleId: 3,
  nombre: 'Seguro obligatorio vigente',
  referencia: 'POL-2026',
  notas: 'Conservar comprobante',
  fechaEmision: '2026-01-02',
  fechaVencimiento: '2026-12-31',
  archivoNombre: 'soap-anterior.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  version: 2,
  tieneArchivo: true,
  subidoPor: 1,
  expiry: { state: 'vigente', daysRemaining: 49 },
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

const mount = (props: Partial<ComponentProps<typeof FleetDocumentFormModal>> = {}) => {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <FleetDocumentFormModal vehicleId={3} onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { ...view, onClose };
};

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

const submit = () => {
  const form = screen.getByRole('dialog').querySelector('form');
  if (!form) throw new Error('No se encontró el formulario de documento');
  fireEvent.submit(form);
};

const chooseFile = (file = new File(['documento'], 'nuevo.pdf', { type: 'application/pdf' })) => {
  fireEvent.change(screen.getByLabelText(/Seleccionar PDF, JPG, PNG o WebP/), {
    target: { files: [file] },
  });
  return file;
};

const setDates = (emission: string, expiry: string) => {
  const noExpiry = screen.getByRole('checkbox', { name: /Sin vencimiento|Fecha de vencimiento pendiente/ });
  if ((noExpiry as HTMLInputElement).checked) fireEvent.click(noExpiry);
  change('Fecha de emisión', emission);
  change('Fecha de vencimiento', expiry);
};

const requestData = () => vi.mocked(api.post).mock.lastCall?.[1] as FormData;

describe('FleetDocumentFormModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.post).mockResolvedValue({ data: { document: savedDocument } } as AxiosResponse);
    vi.mocked(api.patch).mockResolvedValue({ data: { document: savedDocument } } as AxiosResponse);
  });

  it.each(['Permiso de circulación', 'SOAP', 'Revisión técnica'])(
    'prefills %s while retaining the accessible title and allowing metadata without files or dates',
    async (initialName) => {
      const { onClose } = mount({ initialName });
      const dialog = screen.getByRole('dialog', { name: 'Agregar documento' });
      expect(within(dialog).getByRole('combobox', { name: 'Nombre del documento' })).toHaveValue(initialName);
      expect(within(dialog).getByText(initialName, { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByLabelText('Fecha de emisión')).toHaveValue('');
      expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue('');
      submit();
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
      expect(api.post).toHaveBeenCalledWith('/fleet-vehicles/3/documents', expect.any(FormData));
      expect(Object.fromEntries(requestData())).toEqual({
        nombre: initialName, referencia: '', notas: '', fechaEmision: '', fechaVencimiento: '',
      });
    },
  );

  it('preserves every existing document default and its actual name when initialName is supplied', async () => {
    const { onClose } = mount({ document: savedDocument, initialName: 'SOAP' });
    expect(screen.getByRole('dialog', { name: 'Editar documento' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Nombre del documento' })).toHaveValue(savedDocument.nombre);
    expect(screen.getByLabelText('Referencia')).toHaveValue(savedDocument.referencia);
    expect(screen.getByLabelText('Notas')).toHaveValue(savedDocument.notas);
    expect(screen.getByLabelText('Fecha de emisión')).toHaveValue(savedDocument.fechaEmision);
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue(savedDocument.fechaVencimiento);
    expect(screen.getByRole('checkbox', { name: 'Sin vencimiento' })).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/api/fleet-vehicles/3/documents/11/file');
    expect(screen.getByText(/Versión 2/)).toBeInTheDocument();
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.patch).toHaveBeenCalledWith('/fleet-vehicles/3/documents/11', {
      nombre: savedDocument.nombre,
      referencia: savedDocument.referencia,
      notas: savedDocument.notas,
      fechaEmision: savedDocument.fechaEmision,
      fechaVencimiento: savedDocument.fechaVencimiento,
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('requires a document name and permits a custom extra without an expiry', async () => {
    mount();
    submit();
    expect(screen.getByText('El nombre del documento es requerido')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: /^Nombre del documento/ }), {
      target: { value: '  Certificado interno  ' },
    });
    submit();
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    expect(requestData().get('nombre')).toBe('Certificado interno');
    expect(requestData().get('fechaVencimiento')).toBe('');
    expect(requestData().has('file')).toBe(false);
  });

  it.each([false, true])('validates chronological dates when editing=%s and permits correction', async (editing) => {
    const { onClose } = mount({ document: editing ? savedDocument : undefined, initialName: 'Revisión técnica' });
    setDates('2026-11-12', '2026-11-11');
    submit();
    expect(screen.getByText('El vencimiento no puede ser anterior a la emisión')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveAttribute('aria-invalid', 'true');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    change('Fecha de vencimiento', '2026-11-12');
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const request = editing ? api.patch : api.post;
    expect(request).toHaveBeenCalledOnce();
  });

  it('retains the saved expiry when no-expiry is toggled on and off', async () => {
    mount({ document: { ...savedDocument, nombre: 'Documento extra' } });
    const checkbox = screen.getByRole('checkbox', { name: 'Sin vencimiento' });
    fireEvent.click(checkbox);
    expect(screen.getByLabelText('Fecha de vencimiento')).toBeDisabled();
    fireEvent.click(checkbox);
    expect(screen.getByLabelText('Fecha de vencimiento')).toBeEnabled();
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue(savedDocument.fechaVencimiento);
    submit();
    await waitFor(() => expect(api.patch).toHaveBeenCalledOnce());
    expect(api.patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      fechaVencimiento: savedDocument.fechaVencimiento,
    }));
  });

  it('clears a saved expiry only after explicitly selecting Sin vencimiento', async () => {
    mount({ document: { ...savedDocument, nombre: 'Documento extra' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sin vencimiento' }));
    submit();
    await waitFor(() => expect(api.patch).toHaveBeenCalledOnce());
    expect(api.patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ fechaVencimiento: null }));
  });

  it.each([
    ['comprobante.PDF', 'application/pdf'],
    ['comprobante.jpg', 'image/jpeg'],
    ['comprobante.jpeg', 'image/jpeg'],
    ['comprobante.png', 'image/png'],
    ['comprobante.webp', 'image/webp'],
  ])('accepts %s up to and including 10 MB', async (name, type) => {
    mount({ initialName: 'SOAP' });
    const file = new File(['contenido'], name, { type });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 });
    chooseFile(file);
    submit();
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    expect(requestData().get('file')).toBe(file);
  });

  it.each([
    { name: 'grande.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1, error: /supera el límite de 10 MB/ },
    { name: 'programa.exe', type: 'application/pdf', size: 10, error: /Formato de archivo no permitido/ },
    { name: 'falso.pdf', type: 'text/plain', size: 10, error: /Formato de archivo no permitido/ },
    { name: 'sin-tipo.pdf', type: '', size: 10, error: /Formato de archivo no permitido/ },
  ])('rejects $name with a helpful error and allows removing it and retrying', async ({ name, type, size, error }) => {
    mount({ initialName: 'SOAP' });
    change('Referencia', 'Mantener folio');
    const file = new File(['contenido'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    chooseFile(file);
    expect(screen.getByRole('alert')).toHaveTextContent(error);
    submit();
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText(name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar archivo seleccionado' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    chooseFile();
    submit();
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    expect(requestData().get('referencia')).toBe('Mantener folio');
    expect((requestData().get('file') as File).name).toBe('nuevo.pdf');
  });

  it.each([false, true])('preserves the selected file and typed fields after failure when editing=%s', async (editing) => {
    vi.mocked(api.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { error: { message: 'El contenido del archivo no es válido' } } },
    });
    const { onClose } = mount({ document: editing ? savedDocument : undefined });
    change('Nombre del documento', 'Comprobante de seguro');
    change('Referencia', 'Folio escrito');
    change('Notas', 'Notas escritas');
    setDates('2026-11-01', '2027-11-01');
    const file = chooseFile();
    if (editing) {
      expect(screen.getByText('soap-anterior.pdf')).toBeInTheDocument();
      expect(screen.getByText(/la versión actual se conserva en el historial/)).toBeInTheDocument();
    }
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('El contenido del archivo no es válido');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Nombre del documento' })).toHaveValue('Comprobante de seguro');
    expect(screen.getByLabelText('Referencia')).toHaveValue('Folio escrito');
    expect(screen.getByLabelText('Notas')).toHaveValue('Notas escritas');
    expect(screen.getByLabelText('Fecha de emisión')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue('2027-11-01');
    expect(screen.getByText(file.name)).toBeInTheDocument();
    const firstData = requestData();
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenLastCalledWith(
      editing ? '/fleet-vehicles/3/documents/11/versions' : '/fleet-vehicles/3/documents',
      expect.any(FormData),
    );
    expect([...requestData()]).toEqual([...firstData]);
    expect(requestData().get('file')).toBe(file);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each(['Cancelar', 'Cerrar', 'Cerrar formulario de documento', 'Escape'])(
    'confirms dirty close through %s and keeps all unsaved data when continuing', (action) => {
      const { onClose } = mount({ initialName: 'SOAP' });
      change('Referencia', 'No perder');
      change('Notas', 'Borrador');
      const file = chooseFile();
      const close = () => {
        if (action === 'Escape') fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        else fireEvent.click(screen.getByRole('button', { name: action }));
      };
      close();
      expect(screen.getByRole('alertdialog', { name: 'Descartar edición' })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
      fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Referencia')).toHaveValue('No perder');
      expect(screen.getByLabelText('Notas')).toHaveValue('Borrador');
      expect(screen.getByText(file.name)).toBeInTheDocument();
      close();
      fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
      expect(onClose).toHaveBeenCalledOnce();
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it('closes an untouched prefilled slot without a discard prompt', () => {
    const { onClose } = mount({ initialName: 'SOAP' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('treats a selected file as dirty and returns to clean after removing it', () => {
    const { onClose } = mount({ document: savedDocument });
    chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar archivo seleccionado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('blocks repeated submission and every close route synchronously and while pending', async () => {
    let finish!: (response: AxiosResponse) => void;
    vi.mocked(api.post).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { onClose } = mount({ initialName: 'SOAP' });
    change('Referencia', 'Pendiente');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    act(() => {
      submit();
      submit();
      for (const name of ['Cancelar', 'Cerrar', 'Cerrar formulario de documento', 'Descartar cambios']) {
        fireEvent.click(screen.getByRole('button', { name }));
      }
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled());
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Referencia')).toBeDisabled();
    for (const name of ['Cancelar', 'Cerrar', 'Cerrar formulario de documento', 'Descartar cambios']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name }));
    }
    submit();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(api.post).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finish({ data: { document: savedDocument } } as AxiosResponse); });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(api.post).toHaveBeenCalledOnce();
  });

  it('warns before leaving the browser with a draft and removes the warning when clean or unmounted', () => {
    const { unmount } = mount({ initialName: 'SOAP' });
    const warn = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(warn()).toBe(false);
    change('Referencia', 'Borrador');
    expect(warn()).toBe(true);
    change('Referencia', '');
    expect(warn()).toBe(false);
    change('Notas', 'Borrador');
    unmount();
    expect(warn()).toBe(false);
  });
});
