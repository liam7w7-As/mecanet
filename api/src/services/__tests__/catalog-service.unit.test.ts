import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByPk: vi.fn(), findOne: vi.fn(), create: vi.fn(), balance: vi.fn(),
  notify: vi.fn(), update: vi.fn(), movement: vi.fn(),
}));
vi.mock('../../config/database.js', () => ({ sequelize: {
  transaction: async (work: (transaction: object) => Promise<unknown>) => {
    const committed: Array<() => void> = [];
    const result = await work({ afterCommit: (callback: () => void) => { committed.push(callback); } });
    for (const callback of committed) callback();
    return result;
  },
} }));
vi.mock('../../models/CatalogItem.js', () => ({ CatalogItem: {
  findByPk: mocks.findByPk, findOne: mocks.findOne, create: mocks.create,
} }));
vi.mock('../../models/StockBalance.js', () => ({ StockBalance: { findOne: mocks.balance } }));
vi.mock('../permission.service.js', () => ({ hasPermission: async () => true }));
vi.mock('../catalog-events.service.js', () => ({ publishCatalogChange: mocks.notify }));
vi.mock('../warehouse.service.js', () => ({
  getDefaultWarehouse: async () => ({ id: 1 }), registerMovement: mocks.movement,
}));

import { createCatalogItem, updateCatalogItem } from '../catalog.service.js';

const fixture = (changes: Record<string, unknown> = {}) => {
  const item = {
    id: 7, tipo: 'parte', division: 'ACC', subtipo: 'en_stock', codigo: 'FILTRO-7',
    nombre: 'Filtro', descripcion: null, unidadMedida: 'unidad', stock: 0, stockMinimo: 0,
    precio: 15000, horasHombreEstandar: null, createdAt: new Date(), updatedAt: new Date(),
    ...changes,
    update: vi.fn(async (patch: object) => { mocks.update(patch); Object.assign(item, patch); }),
  };
  return item;
};

describe('catalog metadata PATCH and committed invalidation, no application database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOne.mockResolvedValue(null);
    mocks.balance.mockResolvedValue(null);
    mocks.create.mockImplementation(async (data: Record<string, unknown>) => fixture(data));
  });

  it('merges subtype-only PATCH against the current locked ACC item', async () => {
    mocks.findByPk.mockResolvedValue(fixture());
    const item = await updateCatalogItem(7, { subtipo: 'a_pedido' });
    expect(item).toMatchObject({ tipo: 'parte', division: 'ACC', subtipo: 'a_pedido', precio: 15000 });
    expect(mocks.findByPk).toHaveBeenCalledWith(7, expect.objectContaining({ lock: 'UPDATE', transaction: expect.anything() }));
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it('preserves DP and hours on a price-only or unchanged-legacy-type PATCH', async () => {
    mocks.findByPk.mockResolvedValue(fixture({ tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp', horasHombreEstandar: 3.5 }));
    expect(await updateCatalogItem(7, { precio: 0, tipo: 'estandar' }))
      .toMatchObject({ division: 'DP', subtipo: 'servicio_dp', precio: 0, horasHombreEstandar: 3.5 });
  });

  it('rejects incompatible subtype instead of silently moving a DP to another division', async () => {
    mocks.findByPk.mockResolvedValue(fixture({ tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp' }));
    await expect(updateCatalogItem(7, { subtipo: 'a_pedido' })).rejects.toThrow('subtipo');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('blocks changing a stocked part to a_pedido without discarding warehouse inventory', async () => {
    mocks.findByPk.mockResolvedValue(fixture({ stock: 4 }));
    await expect(updateCatalogItem(7, { subtipo: 'a_pedido' })).rejects.toThrow('existencias');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('keeps the rule that stock changes require warehouse movements', async () => {
    mocks.findByPk.mockResolvedValue(fixture({ stock: 4 }));
    await expect(updateCatalogItem(7, { stock: 5 })).rejects.toThrow('movimientos de almacén');
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('normalizes legacy service calls and only notifies successful committed creations', async () => {
    expect(await createCatalogItem({
      tipo: 'parte', nombre: 'Filtro', precio: 0, stock: 0, stockMinimo: 0, unidadMedida: 'unidad',
    })).toMatchObject({ tipo: 'parte', division: 'ACC', subtipo: 'en_stock' });
    expect(mocks.notify).toHaveBeenCalledOnce();
    mocks.notify.mockClear();
    mocks.create.mockRejectedValueOnce(new Error('Fallo de inserción'));
    await expect(createCatalogItem({
      tipo: 'estandar', nombre: 'Puerta', precio: 0, stock: 0, stockMinimo: 0, unidadMedida: 'servicio',
    })).rejects.toThrow('Fallo de inserción');
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
