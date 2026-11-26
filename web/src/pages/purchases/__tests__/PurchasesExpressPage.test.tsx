import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purchaseFixture } from './fixtures';
import { api } from '../../../lib/api';
import { flushFormDrafts, loadFormDraft, saveFormDraft } from '../../../lib/form-recovery';
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
let orderItems = [order];
const product = (index = 0) => within(screen.getByRole('group', { name: `Producto ${index + 1}` }));
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
    orderItems = [order];
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
              : { items: orderItems },
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
      items: [{ costoUnitario: 11900, ventaUnitario: 14875, cantidad: 1 }],
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

  it('retains every OCR product as an editable line before confirming', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: multipleReading });
    setup();
    await openNew();
    choosePhoto();
    await waitFor(() =>
      expect(screen.getAllByLabelText('Accesorio', { exact: true })).toHaveLength(2),
    );
    expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue('Bujía');
    expect(product(1).getByLabelText('Accesorio', { exact: true })).toHaveValue('Espejo');
    fireEvent.change(product().getByLabelText('Accesorio', { exact: true }), {
      target: { value: 'Bujía corregida' },
    });
    fireEvent.change(product().getByLabelText('Cantidad'), { target: { value: '3' } });
    fireEvent.change(product().getByLabelText('Compra por unidad'), { target: { value: '9000' } });
    fireEvent.change(product(1).getByLabelText('Venta por unidad al cliente'), {
      target: { value: '30000' },
    });
    expect(product().getByLabelText('Venta por unidad al cliente')).toHaveValue('11.250');
    expect(screen.getByRole('region', { name: 'Resumen express' })).toHaveTextContent('107.000');
    expect(screen.getByRole('region', { name: 'Resumen express' })).toHaveTextContent('153.750');
    expect(api.post).toHaveBeenCalledTimes(1);
    await selectOrder();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
    await screen.findByRole('heading', { name: 'Compra registrada' });
    expect(parsedBody(1)).toMatchObject({
      workOrderId: 7,
      proveedorNombre: 'Otro proveedor',
      items: [
        { descripcion: 'Bujía corregida', cantidad: 3, costoUnitario: 9000, ventaUnitario: 11250 },
        { descripcion: 'Espejo', cantidad: 4, costoUnitario: 20000, ventaUnitario: 30000 },
      ],
    });
    expect((vi.mocked(api.post).mock.calls[1][1] as FormData).get('comprobante')).toBeInstanceOf(
      File,
    );
  });
  it('replaces automatic data from photo 1 with all products from photo 2', async () => {
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
    await waitFor(() =>
      expect(screen.getAllByLabelText('Accesorio', { exact: true })).toHaveLength(2),
    );
    expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue('Bujía');
    expect(product(1).getByLabelText('Cantidad')).toHaveValue(4);
    expect(product(1).getByLabelText('Compra por unidad')).toHaveValue('20.000');
    expect(product(1).getByLabelText('Venta por unidad al cliente')).toHaveValue('25.000');
    expect(screen.getByLabelText('Proveedor', { exact: false })).toHaveValue('Otro proveedor');
    expect(screen.getByLabelText('Folio', { exact: false })).toHaveValue('F456');
    expect(screen.getByLabelText('Fecha de compra')).toHaveValue('2026-11-25');
    expect(screen.getByLabelText('El importe de compra ya incluye IVA')).not.toBeChecked();
    expect(screen.getByText('foto2.png')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  });
  it.each(['Aceptar nuevos datos', 'Conservar mis datos'])(
    'confirms whole receipt replacements before changing manual fields: %s',
    async (decision) => {
      vi.mocked(api.post)
        .mockResolvedValueOnce({ data: reading })
        .mockResolvedValueOnce({ data: { ...multipleReading, incluyeIva: true } });
      setup();
      await openNew();
      await selectOrder();
      choosePhoto('foto1.png');
      await waitFor(() =>
        expect(product().getByLabelText('Compra por unidad')).toHaveValue('11.900'),
      );
      fireEvent.change(product().getByLabelText('Accesorio', { exact: true }), {
        target: { value: 'Mi accesorio' },
      });
      fireEvent.change(product().getByLabelText('Cantidad'), { target: { value: '3' } });
      fireEvent.change(product().getByLabelText('Compra por unidad'), {
        target: { value: '15000' },
      });
      fireEvent.change(product().getByLabelText('Venta por unidad al cliente'), {
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
      await screen.findByRole('alertdialog');
      expect(screen.getByRole('alertdialog')).toHaveFocus();
      expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue('Mi accesorio');
      expect(product().getByLabelText('Cantidad')).toHaveValue(3);
      expect(product().getByLabelText('Compra por unidad')).toHaveValue('15.000');
      expect(screen.getByLabelText('Proveedor', { exact: false })).toHaveValue('Mi proveedor');
      expect(screen.getByLabelText('Folio', { exact: false })).toHaveValue('MANUAL');
      expect(screen.getByLabelText('Fecha de compra')).toHaveValue('2026-11-20');
      expect(screen.getByLabelText('El importe de compra ya incluye IVA')).not.toBeChecked();
      fireEvent.click(screen.getByRole('button', { name: decision }));
      const accepted = decision === 'Aceptar nuevos datos';
      expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue(
        accepted ? 'Bujía' : 'Mi accesorio',
      );
      expect(product().getByLabelText('Cantidad')).toHaveValue(accepted ? 2 : 3);
      expect(product().getByLabelText('Compra por unidad')).toHaveValue(
        accepted ? '8.000' : '15.000',
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
      expect(product().getByLabelText('Venta por unidad al cliente')).toHaveValue('40.000');
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
          expect(product().getByLabelText('Compra por unidad')).toHaveValue('11.900'),
        );
        expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue(
          'Filtro escaneado',
        );
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(product().getByLabelText('Venta por unidad al cliente')).toHaveValue('40.000');
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
    await waitFor(() =>
      expect(screen.getAllByLabelText('Accesorio', { exact: true })).toHaveLength(2),
    );
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
      if (multiple)
        await waitFor(() =>
          expect(screen.getAllByLabelText('Accesorio', { exact: true })).toHaveLength(2),
        );
      else
        await waitFor(() =>
          expect(screen.getByLabelText('Compra por unidad')).toHaveValue('11.900'),
        );
      expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue(
        source.descripcion,
      );
      expect(product().getByLabelText('Accesorio', { exact: true })).toHaveAttribute('readonly');
      expect(product().getByLabelText('Cantidad')).toHaveValue(source.cantidad);
      expect(product().getByLabelText('Cantidad')).toHaveAttribute('readonly');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
      await screen.findByRole('heading', { name: 'Compra registrada' });
      expect(parsedBody(1)).toMatchObject({
        items: [
          expect.objectContaining({
            requestId: source.id,
            workOrderId: source.order.id,
            descripcion: source.descripcion,
            cantidad: source.cantidad,
            costoUnitario: multiple ? 8000 : 11900,
          }),
          ...(multiple ? [expect.objectContaining({ descripcion: 'Espejo', cantidad: 4 })] : []),
        ],
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
    await waitFor(() =>
      expect(screen.getAllByLabelText('Accesorio', { exact: true })).toHaveLength(2),
    );
    expect(vi.mocked(api.post).mock.calls[0][2]?.signal?.aborted).toBe(true);
    await act(async () => {
      resolve({ data: reading } as AxiosResponse);
    });
    expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue('Bujía');
    expect(product(1).getByLabelText('Compra por unidad')).toHaveValue('20.000');
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
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }));
    fireEvent.change(product(1).getByLabelText('Accesorio', { exact: true }), {
      target: { value: 'Segundo producto' },
    });
    fireEvent.change(product(1).getByLabelText('Compra por unidad'), { target: { value: '5000' } });
    fireEvent.change(product(1).getByLabelText('Venta por unidad al cliente'), {
      target: { value: '8000' },
    });
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
    expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue('Filtro manual');
    expect(product(1).getByLabelText('Accesorio', { exact: true })).toHaveValue('Segundo producto');
    expect(product(1).getByLabelText('Venta por unidad al cliente')).toHaveValue('8.000');
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
    expect(recovered?.payload.items[0].descripcion).toBe('Segunda compra');
    expect(recovered?.payload.operationKey).not.toBe(parsedBody().operationKey);
  });
  it('adds, edits and removes manual products without changing the surviving line', async () => {
    setup();
    await openNew();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }));
    fireEvent.change(product(1).getByLabelText('Accesorio', { exact: true }), {
      target: { value: 'Aceite manual' },
    });
    fireEvent.change(product(1).getByLabelText('Cantidad'), { target: { value: '3' } });
    fireEvent.change(product(1).getByLabelText('Compra por unidad'), { target: { value: '2000' } });
    fireEvent.change(product(1).getByLabelText('Venta por unidad al cliente'), {
      target: { value: '3000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar producto 1' }));
    expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue('Aceite manual');
    expect(product().getByLabelText('Venta por unidad al cliente')).toHaveValue('3.000');
    expect(screen.getByRole('button', { name: 'Quitar producto 1' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }));
    expect(product(1).getByLabelText('Accesorio', { exact: true })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar producto 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
    await screen.findByRole('heading', { name: 'Compra registrada' });
    expect(parsedBody().items).toEqual([
      expect.objectContaining({
        descripcion: 'Aceite manual',
        cantidad: 3,
        costoUnitario: 2000,
        ventaUnitario: 3000,
      }),
    ]);
  });
  it('changes only inherited OTs and searches explicit per-product overrides', async () => {
    const other = { ...order, id: 8, codigo: 'OT-26-8', patente: 'OTRA88' };
    const header = { ...order, id: 10, codigo: 'OT-26-10', patente: 'NUEVA10' };
    orderItems = [order, other, header];
    setup();
    await openNew();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }));
    fireEvent.change(product(1).getByLabelText('Accesorio', { exact: true }), {
      target: { value: 'Espejo' },
    });
    fireEvent.change(product(1).getByLabelText('Compra por unidad'), { target: { value: '8000' } });
    fireEvent.click(product(1).getByRole('button', { name: 'Asignar otra OT' }));
    fireEvent.change(screen.getByLabelText('Buscar OT del producto 2'), {
      target: { value: 'OTRA' },
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/purchases/express/orders', {
        params: { search: 'OTRA' },
      }),
    );
    fireEvent.click(
      await within(screen.getByRole('region', { name: 'Órdenes para producto 2' })).findByRole(
        'button',
        {
          name: /OTRA88/,
        },
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    fireEvent.click(
      within(await screen.findByRole('region', { name: 'Órdenes disponibles' })).getByRole(
        'button',
        { name: /NUEVA10/ },
      ),
    );
    expect(product().getByText(/OT del encabezado:.*OT-26-10/)).toBeInTheDocument();
    expect(product(1).getByText(/OT asignada:.*OT-26-8/)).toBeInTheDocument();
    fireEvent.click(product(1).getByRole('button', { name: 'Usar OT del encabezado' }));
    expect(product(1).getByText(/OT del encabezado:.*OT-26-10/)).toBeInTheDocument();
    fireEvent.click(product(1).getByRole('button', { name: 'Asignar otra OT' }));
    fireEvent.click(
      within(await screen.findByRole('region', { name: 'Órdenes para producto 2' })).getByRole(
        'button',
        { name: /OTRA88/ },
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra y egreso' }));
    await screen.findByRole('heading', { name: 'Compra registrada' });
    expect(parsedBody().workOrderId).toBe(header.id);
    expect(parsedBody().items[0]).not.toHaveProperty('workOrderId');
    expect(parsedBody().items[1].workOrderId).toBe(other.id);
  });
  it('enforces the 30-product limit while allowing removal and manual additions', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        ...reading,
        items: Array.from({ length: 30 }, (_, i) => ({
          ...reading.items[0],
          descripcion: `Producto OCR ${i + 1}`,
        })),
      },
    });
    setup();
    await openNew();
    choosePhoto();
    await waitFor(() =>
      expect(screen.getAllByRole('group', { name: /^Producto / })).toHaveLength(30),
    );
    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar producto 30' }));
    expect(screen.getByRole('button', { name: 'Agregar producto' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }));
    expect(product(29).getByLabelText('Accesorio', { exact: true })).toHaveValue('');
  });
  it.each([null, 9])(
    'safely migrates a legacy draft, evidence and identity (request: %s)',
    async (requestId) => {
      const operationKey = crypto.randomUUID();
      const legacy = {
        operationKey,
        order,
        requestId,
        descripcion: 'Producto recuperado',
        cantidad: '2',
        costoUnitario: '1000',
        ventaUnitario: '2000',
        saleEdited: true,
        conIva: false,
        metodoPago: 'efectivo',
        proveedorNombre: 'Proveedor manual',
        folio: 'ANTERIOR',
        fechaEmision: '2026-11-20',
        detalle: 'Nota manual',
        tipoDocumento: 'otro',
        file: {
          blob: new Blob(['foto'], { type: 'image/png' }),
          name: 'anterior.png',
          lastModified: 1000,
        },
      };
      await saveFormDraft(1, 'purchase:express', legacy, crypto.randomUUID());
      setup();
      fireEvent.click(await screen.findByRole('button', { name: 'Recuperar formulario' }));
      expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue(
        'Producto recuperado',
      );
      expect(product().getByLabelText('Cantidad')).toHaveValue(2);
      expect(product().getByLabelText('Venta por unidad al cliente')).toHaveValue('2.000');
      expect(product().getByLabelText('Detalle')).toHaveValue('Nota manual');
      expect(screen.getByText('anterior.png')).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
      await act(async () => {
        await flushFormDrafts();
      });
      const recovered = (await loadFormDraft(1, 'purchase:express', expressRecoverySchema))!
        .payload;
      expect(recovered.operationKey).toBe(operationKey);
      expect(recovered.items[0].order?.id ?? recovered.order?.id).toBe(order.id);
      expect(recovered.items[0].requestId).toBe(requestId);
      choosePhoto('nueva.png');
      await screen.findByRole('alertdialog');
      fireEvent.click(screen.getByRole('button', { name: 'Conservar mis datos' }));
      expect(product().getByLabelText('Accesorio', { exact: true })).toHaveValue(
        'Producto recuperado',
      );
    },
  );
});
