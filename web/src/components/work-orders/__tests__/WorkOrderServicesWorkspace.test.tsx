import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { calculateDpWorkQuote, createDefaultDpConfiguration, dpQuoteInputSchema } from '@unithor/shared';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { quotationRecoverySchema } from '../../../lib/form-recovery.schemas';
import WorkOrderItemsEditor from '../WorkOrderItemsEditor';

import type { EditableWorkOrderItem } from '../WorkOrderItemsEditor';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() }, getCookie: vi.fn(), setSessionExpiredHandler: vi.fn(),
}));
vi.mock('../../../hooks/useCatalogEvents', () => ({ useCatalogEvents: vi.fn() }));

const configuration = createDefaultDpConfiguration();
configuration.tables.find((entry) => entry.id === 'polishing')!.basePrice = 10000;
configuration.tables.find((entry) => entry.id === 'global_polishing')!.basePrice = 150000;
const record = { revision: 2, configuration, updatedAt: '2026-11-24T12:00:00Z', lastEditor: null };
const selected = () => JSON.parse(screen.getByTestId('items').textContent ?? '[]') as EditableWorkOrderItem[];

function Harness({ body = 'suv', size = 'XL' }: { body?: string; size?: string }) {
  const [items, setItems] = useState<EditableWorkOrderItem[]>([]);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}>
    <WorkOrderItemsEditor serviceWorkspace presentation="reception" vehicle={{ id: 4, dpBodyTypeId: body, dpSizeId: size }}
      items={items} onChange={setItems} showDiscounts showExecution={false} />
    <output data-testid="items">{JSON.stringify(items)}</output>
  </QueryClientProvider>;
}

describe('Step 5 service workspace', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/catalog/dp' ? record : { items: [], totalPages: 0 } }) as AxiosResponse);
    vi.mocked(api.post).mockImplementation(async (_url, input) => ({
      data: { quote: calculateDpWorkQuote(configuration, dpQuoteInputSchema.parse(input), 2) },
    }) as AxiosResponse);
  });

  it('uses the vehicle classification, supports multiple extras and edits without duplicating', async () => {
    render(<Harness />);
    const builder = await screen.findByRole('region', { name: 'Configurar servicio D&P' });
    expect(await within(builder).findByText('SUV · XL')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Carrocería' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pieza y ubicación'), { target: { value: JSON.stringify(['puerta', 'FL']) } });
    fireEvent.change(screen.getByLabelText('Reparación'), { target: { value: 'repair_dent' } });
    fireEvent.change(screen.getByLabelText('Nivel de daño'), { target: { value: 'D2' } });
    fireEvent.change(screen.getByLabelText('Pintura'), { target: { value: 'painting_full' } });
    fireEvent.click(screen.getByText('Servicios adicionales', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Desmontaje y montaje' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pulido por pieza' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(selected()).toHaveLength(1));
    expect(selected()[0].dpPricing).toMatchObject({ bodyTypeId: 'suv', sizeId: 'XL', damageLevelId: 'D2' });
    expect(selected()[0].dpPricing?.operations).toHaveLength(4);
    expect(selected()[0].division).toBe('DP');
    fireEvent.click(screen.getByRole('button', { name: 'Editar servicio D&P 1' }));
    expect(screen.getByLabelText('Nivel de daño')).toHaveValue('D2');
    fireEvent.change(screen.getByLabelText('Nivel de daño'), { target: { value: 'D3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(selected()[0].dpPricing?.damageLevelId).toBe('D3'));
    expect(selected()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Repuestos' }));
    fireEvent.click(screen.getByRole('button', { name: 'D&P' }));
    expect(selected()).toHaveLength(1);
    // Recovery keeps the selection and quote, not just the description and price.
    const recovered = quotationRecoverySchema.shape.items.parse(selected());
    expect(recovered[0].dpPricing).toEqual(selected()[0].dpPricing);
    expect(recovered[0].dpPricingSnapshot).toEqual(selected()[0].dpPricingSnapshot);
  });

  it('shows global services for Completo and sends no piece or damage', async () => {
    render(<Harness />);
    await screen.findByText('SUV · XL');
    fireEvent.click(screen.getByRole('button', { name: 'Completo' }));
    expect(screen.queryByLabelText('Pieza y ubicación')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Pulido completo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(selected()).toHaveLength(1));
    expect(selected()[0].dpPricing?.scope).toBe('global');
    expect(selected()[0].dpPricing).not.toHaveProperty('pieceId');
    expect(selected()[0].dpPricing).not.toHaveProperty('damageLevelId');
  });

  it('never defaults a vehicle with a missing/invalid classification to another body', async () => {
    render(<Harness body="inexistente" size="" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Completa la carrocería');
    expect(screen.queryByLabelText('Pieza y ubicación')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
