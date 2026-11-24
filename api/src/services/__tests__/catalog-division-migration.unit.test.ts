import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { down, up } from '../../database/migrations/062-catalog-divisions-and-dp-workflow.js';

import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import type { QueryInterface } from 'sequelize';

// Vite 5's builtin list predates node:sqlite. Load the Node builtin directly;
// this remains an isolated, in-memory SQL test with no MySQL connection.
const sqlite = (() => {
  try {
    return createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
  } catch {
    return undefined; // Node < 22 still runs the DDL/rollback tests below.
  }
})();

describe('Catalog division and D&P workflow migration 062 (Unit)', () => {
  const tables: Record<string, Record<string, object>> = {
    catalog_items: {},
    quotation_items: {},
    work_order_items: {},
  };
  const existingTables = new Set<string>(['catalog_items', 'quotation_items', 'work_order_items']);
  const indexes = new Map<string, Set<string>>();
  let database: SqliteDatabase | undefined;

  const query = {
    describeTable: vi.fn(async (table: string) => {
      if (!existingTables.has(table)) throw new Error(`Table ${table} does not exist`);
      return tables[table] ?? {};
    }),
    showIndex: vi.fn(async (table: string) => {
      const set = indexes.get(table) ?? new Set<string>();
      return [...set].map((name) => ({ name }));
    }),
    createTable: vi.fn(async (table: string, columns: Record<string, object>) => {
      existingTables.add(table);
      tables[table] = { ...columns };
    }),
    dropTable: vi.fn(async (table: string) => {
      existingTables.delete(table);
      delete tables[table];
      indexes.delete(table);
    }),
    addColumn: vi.fn(async (table: string, name: string, definition: object) => {
      if (!tables[table]) tables[table] = {};
      tables[table][name] = definition;
    }),
    removeColumn: vi.fn(async (table: string, name: string) => {
      if (tables[table]) delete tables[table][name];
    }),
    addIndex: vi.fn(async (table: string, _fields: string[], options: { name: string; unique?: boolean }) => {
      if (!indexes.has(table)) indexes.set(table, new Set());
      indexes.get(table)!.add(options.name);
    }),
    removeIndex: vi.fn(async (table: string, name: string) => {
      indexes.get(table)?.delete(name);
    }),
    sequelize: {
      query: vi.fn(async (sql: string) => {
        database?.exec(sql);
        return [];
      }),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    existingTables.clear();
    existingTables.add('catalog_items');
    existingTables.add('quotation_items');
    existingTables.add('work_order_items');
    tables.catalog_items = {};
    tables.quotation_items = {};
    tables.work_order_items = {};
    delete tables.work_order_dp_stages;
    indexes.clear();
  });

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it('adds division and subtipo to catalog, quotation and work order items, backfills and creates dp stages', async () => {
    await up(query as unknown as QueryInterface);

    // Verify catalog columns
    expect(query.addColumn).toHaveBeenCalledWith(
      'catalog_items',
      'division',
      expect.objectContaining({ defaultValue: 'MEC' }),
    );
    expect(query.addColumn).toHaveBeenCalledWith(
      'catalog_items',
      'subtipo',
      expect.objectContaining({ defaultValue: 'estandar' }),
    );
    expect(query.addIndex).toHaveBeenCalledWith(
      'catalog_items',
      ['division', 'subtipo'],
      expect.objectContaining({ name: 'catalog_items_division_subtipo_idx' }),
    );

    // Verify backfills executed
    expect(query.sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE `catalog_items` SET'),
    );
    expect(query.sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE `quotation_items` SET'),
    );
    expect(query.sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE `work_order_items` SET'),
    );

    // Verify ACC custody and D&P CCF columns on work_order_items
    expect(query.addColumn).toHaveBeenCalledWith(
      'work_order_items',
      'bodeguero_user_id',
      expect.anything(),
    );
    expect(query.addColumn).toHaveBeenCalledWith(
      'work_order_items',
      'entregado_bodega',
      expect.objectContaining({ defaultValue: false }),
    );
    expect(query.addColumn).toHaveBeenCalledWith(
      'work_order_items',
      'armador_user_id',
      expect.anything(),
    );
    expect(query.addColumn).toHaveBeenCalledWith(
      'work_order_items',
      'recibido_taller',
      expect.objectContaining({ defaultValue: false }),
    );
    expect(query.addColumn).toHaveBeenCalledWith(
      'work_order_items',
      'es_a_pedido',
      expect.objectContaining({ defaultValue: false }),
    );
    expect(query.addColumn).toHaveBeenCalledWith(
      'work_order_items',
      'ccf_status',
      expect.anything(),
    );

    // Verify table work_order_dp_stages creation and indexes
    expect(query.createTable).toHaveBeenCalledWith(
      'work_order_dp_stages',
      expect.objectContaining({
        work_order_id: expect.anything(),
        work_order_item_id: expect.anything(),
        stage_index: expect.anything(),
        stage_key: expect.anything(),
      }),
      expect.anything(),
    );
    expect(query.addIndex).toHaveBeenCalledWith(
      'work_order_dp_stages',
      ['work_order_item_id', 'stage_index'],
      expect.objectContaining({ unique: true, name: 'work_order_dp_stages_item_stage_unique' }),
    );
  });

  it('is completely idempotent across restarts', async () => {
    await up(query as unknown as QueryInterface);
    const addColCount = query.addColumn.mock.calls.length;
    const addIdxCount = query.addIndex.mock.calls.length;
    const createTblCount = query.createTable.mock.calls.length;

    await up(query as unknown as QueryInterface);

    // Nothing newly added or created on second run
    expect(query.addColumn).toHaveBeenCalledTimes(addColCount);
    expect(query.addIndex).toHaveBeenCalledTimes(addIdxCount);
    expect(query.createTable).toHaveBeenCalledTimes(createTblCount);
  });

  it.skipIf(!sqlite)('executes backfills without changing valid DP/a_pedido or historical prices and hours on restart', async () => {
    // Exercise the actual portable UPDATE SQL against an isolated in-memory
    // database, never the application/MySQL test database.
    database = new sqlite!.DatabaseSync(':memory:');
    const names = ['catalog_items', 'quotation_items', 'work_order_items'];
    for (const table of names) {
      const type = table === 'catalog_items' ? 'tipo' : 'tipo_linea';
      database.exec(`CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY, ${type} TEXT, division TEXT, subtipo TEXT,
        precio INTEGER, horas NUMERIC
      )`);
      const insert = database.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?, ?, ?)`);
      for (const row of [
        [1, 'estandar', 'DP', 'servicio_dp', 90000, 3.5],
        [2, 'parte', 'ACC', 'a_pedido', 15000, 0],
        [3, 'estandar', 'MEC', 'estandar', 20000, 2],
        [4, 'especifico', 'MEC', 'especifico', 0, 4],
        [5, 'parte', 'MEC', 'estandar', 11000, 0],
        [6, 'especifico', null, null, 0, 1.5],
      ] as const) insert.run(...row);
    }

    await up(query as unknown as QueryInterface);
    const firstRun = names.map((table) => database!.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    for (const rows of firstRun) {
      expect(rows[0]).toMatchObject({ division: 'DP', subtipo: 'servicio_dp', precio: 90000, horas: 3.5 });
      expect(rows[1]).toMatchObject({ division: 'ACC', subtipo: 'a_pedido' });
      expect(rows[4]).toMatchObject({ division: 'ACC', subtipo: 'en_stock', precio: 11000 });
      expect(rows[5]).toMatchObject({ division: 'MEC', subtipo: 'especifico', precio: 0, horas: 1.5 });
    }
    await up(query as unknown as QueryInterface);
    expect(names.map((table) => database!.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).toEqual(firstRun);
  });

  it('rolls back cleanly dropping stages table and added columns', async () => {
    await up(query as unknown as QueryInterface);
    await down(query as unknown as QueryInterface);

    expect(query.dropTable).toHaveBeenCalledWith('work_order_dp_stages');
    expect(query.removeColumn).toHaveBeenCalledWith('work_order_items', 'division');
    expect(query.removeColumn).toHaveBeenCalledWith('catalog_items', 'division');
    expect(query.removeColumn).toHaveBeenCalledWith('quotation_items', 'division');
  });
});
