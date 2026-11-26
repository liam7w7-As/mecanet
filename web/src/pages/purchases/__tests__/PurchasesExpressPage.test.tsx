import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purchaseFixture } from './fixtures';
import { api } from '../../../lib/api';
import { flushFormDrafts, loadFormDraft } from '../../../lib/form-recovery';
import { expressRecoverySchema } from '../../../lib/purchase-express-recovery';
import { useAuthStore } from '../../../stores/auth.store';
import PurchasesExpressPage from '../PurchasesExpressPage';

import type { ExpressPurchaseRequest, ExpressScanResult } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));
const order = {
  id: 7,
  codigo: 'OT-26-7',
  estado: 'en_proceso',
  patente: 'ABCD12',
  vehicleId: 3,
  vehiculo: 'Toyota Yaris',
  cliente: 'Cliente demo',
};
const source: ExpressPurchaseRequest = {
  id: 9,
  estado: 'aprobada',
  descripcion: 'Filtro solicitado',
  cantidad: 2,
  detalle: 'Necesario para reparar',
  solicitadoPor: 'Armador',
  createdAt: '2026-11-25',
  order,
  porComprar: true,
};
const reading: ExpressScanResult = {
  documento: 'recibo',
  proveedorNombre: 'Repuestos Central',
  folio: 'F123',
  fechaEmision: null,
  incluyeIva: true,
  items: [{ descripcion: 'Filtro escaneado', codigo: 'FIL1', cantidad: 1, costoUnitario: 11900 }],
  advertencias: [],
};
const multipleReading: ExpressScanResult = {
  ...reading,
  proveedorNombre: 'Otro proveedor',
  folio: 'F456',
  fechaEmision: '2026-11-25',
  incluyeIva: false,
  items: [
    { descripcion: 'Bujía', codigo: 'BUJ1', cantidad: 2, costoUnitario: 8000 },
    { descripcion: 'Espejo', codigo: 'ESP1', cantidad: 4, costoUnitario: 20000 },
  ],
};
const saved = { ...purchaseFixture, id: 45, codigo: 'COMP-000045', express: true, total: 23800 };
let scannerConfigured = true;
let requestItems: ExpressPurchaseRequest[] = [];
const setup = (initiallyOpen = false) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PurchasesExpressPage initiallyOpen={initiallyOpen} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
};
const openNew = async () => {
  const button = await screen.findByRole('button', { name: 'Nueva compra' });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
};
const selectOrder = async () => {
  fireEvent.focus(screen.getByLabelText('Buscar OT o patente'));
  fireEvent.click(await screen.findByRole('button', { name: /ABCD12.*OT-26-7/ }));
};
const fill = async () => {
  await selectOrder();
  fireEvent.change(screen.getByLabelText('Accesorio', { exact: true }), {
    target: { value: 'Filtro manual' },
  });
  fireEvent.change(screen.getByLabelText('Compra por unidad'), { target: { value: '11900' } });
};
const parsedBody = (index = 0) =>
  JSON.parse((vi.mocked(api.post).mock.calls[index][1] as FormData).get('payload') as string);
const choosePhoto = (name = 'recibo.png') =>
  fireEvent.change(screen.getByLabelText('Elegir foto del recibo'), {
    target: { files: [new File(['image'], name, { type: 'image/png' })] },
  });

describe('Compras express mobile flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scannerConfigured = true;
    requestItems = [];
    useAuthStore.setState({
      user: { id: 1, nombre: 'Jefe', email: 'jefe@test.local', role: 'jefe' },
      isAuthenticated: true,
      isLoading: false,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:express-test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.mocked(api.get).mockImplementation(
      async (url) =>
        ({
          data:
            url === '/purchases/express/requests'
              ? { items: requestItems, scannerConfigured }
              : { items: [order] },
        }) as AxiosResponse,
    );
    vi.mocked(api.post).mockImplementation(
      async (url) =>
        ({
          data: url === '/purchases/express/scan' ? reading : { purchase: saved },
        }) as AxiosResponse,
    );
  });
  it('shows requests first and opens their prefilled form in place, without a modal', async () => {
    requestItems = [
      source,
      {
        ...source,
        id: 10,
        estado: 'pendiente',
        porComprar: false,
        descripcion: 'Pendiente del jefe',
      },
    ];
    setup();
    expect(await screen.findByText('Filtro solicitado')).toBeInTheDocument();
    expect(screen.getByText('Por autorizar')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Registrar compra' });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro solicitado');
    expect(screen.getByLabelText('Cantidad')).toHaveValue(2);
    expect(screen.getByText('OT-26-7 · Toyota Yaris')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('supports a manual purchase, proposes +25% and sends only after confirmation', async () => {
    const { client } = setup();
    await openNew();
    await fill();
    expect(screen.getByLabelText('Venta por unidad al cliente')).toHaveValue('14.875');
    expect(screen.getByLabelText('Escanear con cámara')).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Elegir foto del recibo')).not.toHaveAttribute('capture');
    expect(api.post).not.toHaveBeenCalled();
    client.setQueryData(['quotations'], { items: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
    expect(await screen.findByRole('heading', { name: 'Compra registrada' })).toBeInTheDocument();
    expect(parsedBody()).toMatchObject({
      workOrderId: 7,
      costoUnitario: 11900,
      ventaUnitario: 14875,
      cantidad: 1,
      metodoPago: 'efectivo',
    });
    expect((vi.mocked(api.post).mock.calls[0][1] as FormData).get('comprobante')).toBeNull();
    expect(client.getQueryState(['quotations'])?.isInvalidated).toBe(true);
  });
  it('blocks a below-minimum sale, and does not silently replace an edited sale when cost rises', async () => {
    setup();
    await openNew();
    await fill();
    fireEvent.change(screen.getByLabelText('Venta por unidad al cliente'), {
      target: { value: '14000' },
    });
    expect(screen.getByRole('button', { name: 'Confirmar compra y egreso' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Compra por unidad'), { target: { value: '15000' } });
    expect(screen.getByLabelText('Venta por unidad al cliente')).toHaveValue('14.000');
    expect(screen.getByRole('button', { name: 'Confirmar compra y egreso' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Usar sugerido' }));
    expect(screen.getByLabelText('Venta por unidad al cliente')).toHaveValue('18.750');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('prefills a single scan without registering a purchase or expense', async () => {
    setup();
    await openNew();
    fireEvent.change(screen.getByLabelText('Elegir foto del recibo'), {
      target: { files: [new File(['image'], 'recibo.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(screen.getByLabelText('Compra por unidad')).toHaveValue('11.900'));
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro escaneado');
    expect(screen.getByLabelText('Venta por unidad al cliente')).toHaveValue('14.875');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/purchases/express/scan');
  });
  it.each(['Aceptar nuevos datos', 'Conservar mis datos'])(
    'asks before replacing edits made while reading: %s',
    async (decision) => {
      let resolve!: (value: AxiosResponse) => void;
      vi.mocked(api.post).mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      setup();
      await openNew();
      fireEvent.change(screen.getByLabelText('Elegir foto del recibo'), {
        target: { files: [new File(['image'], 'recibo.png', { type: 'image/png' })] },
      });
      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText('Accesorio', { exact: true }), {
        target: { value: 'Corrección manual' },
      });
      fireEvent.change(screen.getByLabelText('Compra por unidad'), { target: { value: '15000' } });
      await act(async () => {
        resolve({ data: reading } as AxiosResponse);
      });
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Corrección manual');
      expect(screen.getByLabelText('Compra por unidad')).toHaveValue('15.000');
      expect(screen.getByLabelText('Proveedor', { exact: false })).toHaveValue('');
      expect(await screen.findByRole('alertdialog')).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Confirmar compra y egreso' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: decision }));
      const accepted = decision === 'Aceptar nuevos datos';
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue(
        accepted ? 'Filtro escaneado' : 'Corrección manual',
      );
      expect(screen.getByLabelText('Compra por unidad')).toHaveValue(
        accepted ? '11.900' : '15.000',
      );
      expect(screen.getByLabelText('Proveedor', { exact: false })).toHaveValue(
        accepted ? 'Repuestos Central' : '',
      );
      expect(screen.getByRole('img', { name: 'Foto de la etiqueta o recibo' })).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveFocus();
      expect(api.post).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves a previously entered cost unless the detected price is explicitly accepted', async () => {
    setup();
    await openNew();
    await fill();
    fireEvent.change(screen.getByLabelText('Compra por unidad'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Elegir foto del recibo'), {
      target: { files: [new File(['image'], 'recibo.png', { type: 'image/png' })] },
    });
    const useDetected = await screen.findByRole('button', { name: /Usar precio detectado/ });
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('15.000');
    fireEvent.click(screen.getByRole('button', { name: 'Conservar mis datos' }));
    fireEvent.click(useDetected);
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('15.000');
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar nuevos datos' }));
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('11.900');
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro manual');
  });
  it('can stop a slow scan, keeping the evidence and ignoring its late response', async () => {
    let resolve!: (value: AxiosResponse) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    setup();
    await openNew();
    await fill();
    fireEvent.change(screen.getByLabelText('Elegir foto del recibo'), {
      target: { files: [new File(['image'], 'recibo.png', { type: 'image/png' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar manualmente' }));
    expect(screen.getByRole('button', { name: 'Confirmar compra y egreso' })).not.toBeDisabled();
    expect(screen.getByRole('img', { name: 'Foto de la etiqueta o recibo' })).toBeInTheDocument();
    await act(async () => {
      resolve({ data: reading } as AxiosResponse);
    });
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro manual');
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('asks which product to use when a receipt contains several products', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        ...reading,
        items: [
          ...reading.items,
          { ...reading.items[0], descripcion: 'Espejo', costoUnitario: 20000 },
        ],
      },
    });
    setup();
    await openNew();
    fireEvent.change(screen.getByLabelText('Elegir foto del recibo'), {
      target: { files: [new File(['image'], 'recibo.png', { type: 'image/png' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Espejo/ }));
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Espejo');
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('20.000');
  });
  it('replaces automatic data from photo 1 with the selected product from photo 2', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: reading })
      .mockResolvedValueOnce({ data: multipleReading });
    setup();
    await openNew();
    choosePhoto('foto1.png');
    await waitFor(() =>
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro escaneado'),
    );
    choosePhoto('foto2.png');
    const product = await screen.findByRole('button', { name: /Espejo/ });
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro escaneado');
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('11.900');
    fireEvent.click(product);
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Espejo');
    expect(screen.getByLabelText('Cantidad')).toHaveValue(4);
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('20.000');
    expect(screen.getByLabelText('Venta por unidad al cliente')).toHaveValue('25.000');
    expect(screen.getByLabelText('Proveedor', { exact: false })).toHaveValue('Otro proveedor');
    expect(screen.getByLabelText('Folio', { exact: false })).toHaveValue('F456');
    expect(screen.getByLabelText('Fecha de compra')).toHaveValue('2026-11-25');
    expect(screen.getByLabelText('El importe de compra ya incluye IVA')).not.toBeChecked();
    expect(screen.getByText('foto2.png')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  });
  it.each(['Aceptar nuevos datos', 'Conservar mis datos'])(
    'confirms selected product replacements before changing manual fields: %s',
    async (decision) => {
      vi.mocked(api.post)
        .mockResolvedValueOnce({ data: reading })
        .mockResolvedValueOnce({ data: { ...multipleReading, incluyeIva: true } });
      setup();
      await openNew();
      await selectOrder();
      choosePhoto('foto1.png');
      await waitFor(() => expect(screen.getByLabelText('Compra por unidad')).toHaveValue('11.900'));
      fireEvent.change(screen.getByLabelText('Accesorio', { exact: true }), {
        target: { value: 'Mi accesorio' },
      });
      fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('Compra por unidad'), { target: { value: '15000' } });
      fireEvent.change(screen.getByLabelText('Venta por unidad al cliente'), {
        target: { value: '40000' },
      });
      fireEvent.change(screen.getByLabelText('Proveedor', { exact: false }), {
        target: { value: 'Mi proveedor' },
      });
      fireEvent.change(screen.getByLabelText('Folio', { exact: false }), {
        target: { value: 'MANUAL' },
      });
      fireEvent.change(screen.getByLabelText('Fecha de compra'), {
        target: { value: '2026-11-20' },
      });
      fireEvent.click(screen.getByLabelText('El importe de compra ya incluye IVA'));
      await act(async () => {
        await flushFormDrafts();
      });
      const before = (await loadFormDraft(1, 'purchase:express', expressRecoverySchema))!.payload;
      choosePhoto('foto2.png');
      fireEvent.click(await screen.findByRole('button', { name: /Espejo/ }));
      expect(screen.getByRole('alertdialog')).toHaveFocus();
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Mi accesorio');
      expect(screen.getByLabelText('Cantidad')).toHaveValue(3);
      expect(screen.getByLabelText('Compra por unidad')).toHaveValue('15.000');
      expect(screen.getByLabelText('Proveedor', { exact: false })).toHaveValue('Mi proveedor');
      expect(screen.getByLabelText('Folio', { exact: false })).toHaveValue('MANUAL');
      expect(screen.getByLabelText('Fecha de compra')).toHaveValue('2026-11-20');
      expect(screen.getByLabelText('El importe de compra ya incluye IVA')).not.toBeChecked();
      fireEvent.click(screen.getByRole('button', { name: decision }));
      const accepted = decision === 'Aceptar nuevos datos';
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue(
        accepted ? 'Espejo' : 'Mi accesorio',
      );
      expect(screen.getByLabelText('Cantidad')).toHaveValue(accepted ? 4 : 3);
      expect(screen.getByLabelText('Compra por unidad')).toHaveValue(
        accepted ? '20.000' : '15.000',
      );
      expect(screen.getByLabelText('Proveedor', { exact: false })).toHaveValue(
        accepted ? 'Otro proveedor' : 'Mi proveedor',
      );
      expect(screen.getByLabelText('Folio', { exact: false })).toHaveValue(
        accepted ? 'F456' : 'MANUAL',
      );
      expect(screen.getByLabelText('Fecha de compra')).toHaveValue(
        accepted ? '2026-11-25' : '2026-11-20',
      );
      expect(screen.getByLabelText('El importe de compra ya incluye IVA')).toHaveProperty(
        'checked',
        accepted,
      );
      expect(screen.getByLabelText('Venta por unidad al cliente')).toHaveValue('40.000');
      expect(screen.getByRole('img', { name: 'Foto de la etiqueta o recibo' })).toBeInTheDocument();
      expect(screen.getByText('foto2.png')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await act(async () => {
        await flushFormDrafts();
      });
      const after = (await loadFormDraft(1, 'purchase:express', expressRecoverySchema))!.payload;
      expect(after.operationKey).toBe(before.operationKey);
      expect(after.file?.name).toBe('foto2.png');
      if (!accepted) expect({ ...after, file: before.file }).toEqual(before);
      else {
        vi.mocked(api.post).mockResolvedValueOnce({ data: reading });
        choosePhoto('foto3.png');
        await waitFor(() =>
          expect(screen.getByLabelText('Compra por unidad')).toHaveValue('11.900'),
        );
        expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro escaneado');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Venta por unidad al cliente')).toHaveValue('40.000');
      }
    },
  );
  it('clears previous automatic values when the new product has unreadable fields', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: multipleReading })
      .mockResolvedValueOnce({
        data: {
          ...reading,
          proveedorNombre: null,
          folio: null,
          items: [{ ...reading.items[0], cantidad: null, costoUnitario: null }],
        },
      });
    setup();
    await openNew();
    choosePhoto('foto1.png');
    fireEvent.click(await screen.findByRole('button', { name: /Espejo/ }));
    choosePhoto('foto2.png');
    await waitFor(() =>
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro escaneado'),
    );
    expect(screen.getByLabelText('Cantidad')).toHaveValue(1);
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('');
    expect(screen.getByLabelText('Venta por unidad al cliente')).toHaveValue('');
    expect(screen.getByLabelText('Proveedor', { exact: false })).toHaveValue('');
    expect(screen.getByLabelText('Folio', { exact: false })).toHaveValue('');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  it.each([false, true])(
    'protects request description and quantity (multiple products: %s)',
    async (multiple) => {
      requestItems = [source];
      vi.mocked(api.post).mockResolvedValueOnce({ data: multiple ? multipleReading : reading });
      setup();
      const register = await screen.findByRole('button', { name: 'Registrar compra' });
      await waitFor(() => expect(register).not.toBeDisabled());
      fireEvent.click(register);
      choosePhoto();
      if (multiple) fireEvent.click(await screen.findByRole('button', { name: /Espejo/ }));
      else
        await waitFor(() =>
          expect(screen.getByLabelText('Compra por unidad')).toHaveValue('11.900'),
        );
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue(source.descripcion);
      expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveAttribute('readonly');
      expect(screen.getByLabelText('Cantidad')).toHaveValue(source.cantidad);
      expect(screen.getByLabelText('Cantidad')).toHaveAttribute('readonly');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
      await screen.findByRole('heading', { name: 'Compra registrada' });
      expect(parsedBody(1)).toMatchObject({
        requestId: source.id,
        descripcion: source.descripcion,
        cantidad: source.cantidad,
        costoUnitario: multiple ? 20000 : 11900,
      });
    },
  );
  it('ignores an older scan that resolves after a newer photo and product selection', async () => {
    let resolve!: (value: AxiosResponse) => void;
    vi.mocked(api.post)
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce({ data: multipleReading });
    setup();
    await openNew();
    choosePhoto('foto1.png');
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    choosePhoto('foto2.png');
    fireEvent.click(await screen.findByRole('button', { name: /Espejo/ }));
    expect(vi.mocked(api.post).mock.calls[0][2]?.signal?.aborted).toBe(true);
    await act(async () => {
      resolve({ data: reading } as AxiosResponse);
    });
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Espejo');
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('20.000');
    expect(screen.getByText('foto2.png')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Filtro escaneado', { exact: false })).not.toBeInTheDocument();
  });
  it('discards a pending confirmation when another photo starts reading', async () => {
    let resolve!: (value: AxiosResponse) => void;
    setup();
    await openNew();
    await fill();
    choosePhoto('foto1.png');
    await screen.findByRole('alertdialog');
    vi.mocked(api.post).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    choosePhoto('foto2.png');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar manualmente' }));
    await act(async () => {
      resolve({ data: multipleReading } as AxiosResponse);
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Espejo/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro manual');
    expect(screen.getByText('foto2.png')).toBeInTheDocument();
  });
  it('keeps the draft and attached photo after a scan failure', async () => {
    setup();
    await openNew();
    await fill();
    await act(async () => {
      await flushFormDrafts();
    });
    const before = (await loadFormDraft(1, 'purchase:express', expressRecoverySchema))!.payload;
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Lectura fallida'));
    choosePhoto('fallida.png');
    expect(
      await screen.findByText('No se pudo leer la foto. Puedes completar los datos manualmente.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto de la etiqueta o recibo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar compra y egreso' })).not.toBeDisabled();
    await act(async () => {
      await flushFormDrafts();
    });
    const after = (await loadFormDraft(1, 'purchase:express', expressRecoverySchema))!.payload;
    expect({ ...after, file: null }).toEqual(before);
    expect(after.file?.name).toBe('fallida.png');
  });
  it('keeps image and manual entry usable if IA is unavailable', async () => {
    scannerConfigured = false;
    setup();
    await openNew();
    await fill();
    fireEvent.change(screen.getByLabelText('Elegir foto del recibo'), {
      target: { files: [new File(['image'], 'recibo.png', { type: 'image/png' })] },
    });
    expect(await screen.findByText(/Falta configurar la IA/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto de la etiqueta o recibo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Compra por unidad')).toHaveValue('11.900');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('keeps the operation key and form for safe retries after a lost response', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Respuesta perdida'));
    setup();
    await openNew();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar compra y egreso' })).not.toBeDisabled(),
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    const first = parsedBody();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(parsedBody(1).operationKey).toBe(first.operationKey);
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro manual');
  });
  it('recovers the draft and photo after leaving, without automatically submitting', async () => {
    scannerConfigured = false;
    const first = setup();
    await openNew();
    await fill();
    fireEvent.change(screen.getByLabelText('Elegir foto del recibo'), {
      target: { files: [new File(['image'], 'guardada.png', { type: 'image/png' })] },
    });
    await act(async () => {
      await flushFormDrafts();
    });
    const savedDraft = await loadFormDraft(1, 'purchase:express', expressRecoverySchema);
    expect(savedDraft?.payload.file?.name).toBe('guardada.png');
    const key = savedDraft!.payload.operationKey;
    first.unmount();
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
    expect(await screen.findByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro manual');
    expect(screen.getByRole('img', { name: 'Foto de la etiqueta o recibo' })).toBeInTheDocument();
    await act(async () => {
      await flushFormDrafts();
    });
    expect(
      (await loadFormDraft(1, 'purchase:express', expressRecoverySchema))!.payload.operationKey,
    ).toBe(key);
    expect(api.post).not.toHaveBeenCalled();
  });
  it('keeps read-only access and revocation from causing any purchase', async () => {
    setup();
    await openNew();
    await fill();
    act(() =>
      useAuthStore.setState({
        user: {
          ...useAuthStore.getState().user!,
          permissions: [{ modulo: 'compras', accion: 'read' }],
        },
      }),
    );
    expect(screen.getByRole('button', { name: 'Confirmar compra y egreso' })).toBeDisabled();
    expect(screen.getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro manual');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('starts a new recoverable session after a successful purchase', async () => {
    setup();
    await openNew();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
    await screen.findByRole('heading', { name: 'Compra registrada' });
    await openNew();
    await fill();
    fireEvent.change(screen.getByLabelText('Accesorio', { exact: true }), {
      target: { value: 'Segunda compra' },
    });
    await act(async () => {
      await flushFormDrafts();
    });
    const recovered = await loadFormDraft(1, 'purchase:express', expressRecoverySchema);
    expect(recovered?.payload.descripcion).toBe('Segunda compra');
    expect(recovered?.payload.operationKey).not.toBe(parsedBody().operationKey);
  });
});
