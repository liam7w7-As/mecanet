import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { calculateDpWorkQuote, createDefaultDpConfiguration, dpQuoteInputSchema } from '@unithor/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { formatClp } from '../../../lib/formatters';
import { useAuthStore } from '../../../stores/auth.store';
import DpCatalogPanel from '../DpCatalogPanel';

import type { DpConfigurationRecord } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));

const record = (): DpConfigurationRecord => ({
  revision: 1, configuration: createDefaultDpConfiguration(), updatedAt: '2026-11-24T10:00:00.000Z', lastEditor: null,
});
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><DpCatalogPanel onClose={vi.fn()} /></QueryClientProvider>);
}
async function selectBumper() {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Pieza' }), { target: { value: 'parachoque' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Ubicación' }), { target: { value: 'F' } });
}

describe('Catálogo y calculadora D&P', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 3, nombre: 'Vendedor', email: 'vendedor@unithor.cl', role: 'vendedor' }, isAuthenticated: true, isLoading: false });
    vi.mocked(api.get).mockResolvedValue({ data: record() } as AxiosResponse<DpConfigurationRecord>);
    vi.mocked(api.post).mockImplementation(async (_url, raw) => ({
      data: { quote: calculateDpWorkQuote(record().configuration, dpQuoteInputSchema.parse(raw), 1) },
    }) as AxiosResponse);
  });

  it('permite consultar por carrocería y tamaño, filtra piezas y distingue las tarifas pendientes', async () => {
    renderPanel();
    expect(await screen.findByRole('combobox', { name: 'Carrocería' })).toHaveValue('hatchback');
    expect(screen.getByRole('combobox', { name: 'Tamaño del vehículo' })).toHaveValue('S');
    expect(screen.getByRole('checkbox', { name: 'Pulido por pieza' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Carrocería' }), { target: { value: 'suv' } });
    expect(screen.getByRole('combobox', { name: 'Tamaño del vehículo' })).toHaveValue('M');
    fireEvent.change(screen.getByRole('combobox', { name: 'Tamaño del vehículo' }), { target: { value: 'XL' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pieza o servicio' }), { target: { value: 'capó' } });
    expect(screen.getByText('Capó · Única')).toBeInTheDocument();
    expect(screen.queryByText('Parachoque · Delantero')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('calcula pintura, reparación D2 y desmontaje/montaje con el desglose de factores e IVA', async () => {
    renderPanel();
    await selectBumper();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pintura completa de la pieza' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reparación de plásticos y parachoques' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Desmontaje y montaje' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Nivel de daño' }), { target: { value: 'D2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular prueba' }));
    const result = await screen.findByRole('region', { name: 'Resultado del cálculo' });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/catalog/dp/quote', expect.objectContaining({
      configurationRevision: 1, bodyTypeId: 'hatchback', sizeId: 'S', pieceId: 'parachoque', positionId: 'F', damageLevelId: 'D2', scope: 'piece',
    }));
    expect(result).toHaveTextContent(formatClp(129850, 2));
    expect(result).toHaveTextContent('IVA (19%)');
    expect(result).toHaveTextContent('0,85 + 0,5 de daño');
    expect(result).toHaveTextContent('no registra servicios');
  });

  it('limpia el daño al quitar reparación y no lo envía en una prueba de pintura', async () => {
    renderPanel();
    await selectBumper();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Desabolladura' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Nivel de daño' }), { target: { value: 'D3' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Desabolladura' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pintura completa de la pieza' }));
    expect(screen.queryByRole('combobox', { name: 'Nivel de daño' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Calcular prueba' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.post).mock.calls[0][1]).not.toHaveProperty('damageLevelId');
    expect(await screen.findByRole('region', { name: 'Resultado del cálculo' })).toHaveTextContent(formatClp(84150, 2));
  });

  it('aplica descuentos manuales y oculta el cálculo anterior al cambiar la selección', async () => {
    renderPanel();
    await selectBumper();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pintura completa de la pieza' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Descuento de Pintura completa de la pieza' }), { target: { value: 'fijo' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Valor del descuento de Pintura completa de la pieza' }), { target: { value: '4150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular prueba' }));
    expect(await screen.findByRole('region', { name: 'Resultado del cálculo' })).toHaveTextContent(formatClp(80000, 2));
    expect(api.post).toHaveBeenCalledWith('/catalog/dp/quote', expect.objectContaining({ operations: [{ operationId: 'painting_full', descuentoTipo: 'fijo', descuentoValor: 4150 }] }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Tamaño del vehículo' }), { target: { value: 'M' } });
    expect(screen.queryByRole('region', { name: 'Resultado del cálculo' })).not.toBeInTheDocument();
  });

  it('exige pieza y ubicación antes de llamar al cálculo, sin crear OT ni COT', async () => {
    renderPanel();
    await screen.findByRole('combobox', { name: 'Pieza' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pintura completa de la pieza' }));
    fireEvent.click(screen.getByRole('button', { name: 'Calcular prueba' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('permite lectura comercial pero no consulta si faltan ambos permisos de lectura', () => {
    useAuthStore.setState({ user: { id: 4, nombre: 'Sin permiso', email: 'no@unithor.cl', role: 'vendedor', permissions: [] } });
    renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(api.get).not.toHaveBeenCalled();
  });
});
