import { afterEach, describe, expect, it, vi } from 'vitest';

import { sequelize } from '../../../config/database.js';
import { Client } from '../../../models/Client.js';
import { ApiError } from '../../../utils/ApiError.js';
import {
  buildImportPreview,
  changesBetween,
  executePlannedImport,
  hasCell,
  importRecordId,
} from '../import-plan.service.js';

import type { ImportContext, ImportPlanRow } from '../import-plan.service.js';
import type { SpreadsheetData } from '../spreadsheet.service.js';

const file = Buffer.from('synthetic-workbook');
const sheet: SpreadsheetData = {
  sheetName: 'Datos',
  headerRow: 1,
  headers: ['Patente', 'Propietario'],
  mappedColumns: { patente: 'Patente', propietario: 'Propietario' },
  missingColumns: [],
  rows: [],
  totalRows: 1,
  truncated: false,
  maxRows: 1000,
};
const actor: ImportContext = { userId: 123, role: 'admin' };
const row = (snapshot: unknown = { id: 1, version: 'initial' }): ImportPlanRow => ({
  row: 2,
  label: 'ABCD12',
  status: 'update',
  existingId: 1,
  values: { patente: 'ABCD12', marca: 'Toyota' },
  messages: [],
  changes: [{ field: 'marca', label: 'Marca', before: 'Ford', after: 'Toyota' }],
  snapshot,
  apply: vi.fn().mockResolvedValue(undefined),
});
const execute = (rows: ImportPlanRow[], context: ImportContext, dryRun = false, buffer = file) =>
  executePlannedImport('vehicles', buffer, 'datos.xlsx', dryRun, sheet, context, async () => rows);

afterEach(() => vi.restoreAllMocks());

describe('Vista previa vinculada al archivo y a los registros', () => {
  it('requiere revisión previa y nunca aplica sin token', async () => {
    const planned = row();
    await expect(execute([planned], actor)).rejects.toMatchObject({
      statusCode: 400,
      code: 'IMPORT_PREVIEW_REQUIRED',
    });
    expect(planned.apply).not.toHaveBeenCalled();
  });

  it('permite confirmar la misma revisión y cuenta la actualización', async () => {
    const planned = row();
    const preview = await execute([planned], actor, true);
    expect(planned.apply).not.toHaveBeenCalled();
    expect(preview).toMatchObject({ updateRows: 1, newRows: 0, validRows: 1 });
    const result = await execute([planned], { ...actor, previewToken: preview.previewToken });
    expect(result).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(result.rows[0].status).toBe('updated');
    expect(result.previewToken).toBeUndefined();
    expect(planned.apply).toHaveBeenCalledOnce();
  });

  it.each(['file', 'user', 'warehouse', 'record', 'signature', 'expiry'] as const)(
    'rechaza revisión obsoleta o alterada (%s) sin escribir',
    async (cause) => {
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      const planned = row();
      const preview = await execute([planned], actor, true);
      const context = { ...actor, previewToken: preview.previewToken };
      if (cause === 'user') context.userId = 456;
      if (cause === 'warehouse') context.warehouseId = 9;
      if (cause === 'record') planned.snapshot = { id: 1, version: 'modified-by-someone-else' };
      if (cause === 'signature') context.previewToken += 'tampered';
      if (cause === 'expiry') clock.mockReturnValue(now + 31 * 60 * 1000);
      await expect(
        execute([planned], context, false, cause === 'file' ? Buffer.from('other-file') : file),
      ).rejects.toMatchObject({ statusCode: 409, code: 'IMPORT_PREVIEW_CHANGED' });
      expect(planned.apply).not.toHaveBeenCalled();
    },
  );

  it('retira datos privados también de los cambios y encabezados', () => {
    const planned = row();
    planned.values.propietario = 'Dato privado';
    planned.changes!.push({
      field: 'propietario',
      label: 'Propietario',
      before: 'Antes privado',
      after: 'Dato privado',
    });
    const preview = buildImportPreview(
      'fleet-vehicles',
      file,
      'datos.xlsx',
      sheet,
      [planned],
      actor,
      ['propietario'],
    );
    expect(preview.rows[0].values).not.toHaveProperty('propietario');
    expect(preview.rows[0].changes).not.toContainEqual(
      expect.objectContaining({ field: 'propietario' }),
    );
    expect(preview.headers).not.toContain('Propietario');
    expect(JSON.stringify(preview)).not.toContain('privado');
  });

  it('conserva el cero como cambio explícito y diferencia celdas vacías', () => {
    expect(hasCell(0)).toBe(true);
    expect(hasCell('  ')).toBe(false);
    expect(hasCell(null)).toBe(false);
    expect(changesBetween({ stock: 4 }, { stock: 0 }, { stock: 'Stock' })).toEqual([
      { field: 'stock', label: 'Stock', before: 4, after: 0 },
    ]);
  });

  it.each([1.5, 'ID12', '1abc', 0, -1, '1.000', 2_147_483_648])(
    'no permite que un ID ambiguo (%s) actualice otro registro',
    (id) => {
      expect(() => importRecordId({ rowNumber: 2, values: { id } })).toThrow(
        'El ID debe ser un entero positivo',
      );
    },
  );

  it('revierte una fila completa y permite aplicar otra fila válida', async () => {
    expect(sequelize.getDatabaseName()).toBe('unithor_test');
    const prefix = `Import savepoint ${Date.now()}`;
    const invalid = {
      ...row(),
      status: 'valid' as const,
      existingId: undefined,
      apply: async (transaction: Parameters<NonNullable<ImportPlanRow['apply']>>[0]) => {
        await Client.create({ nombre: `${prefix} rollback`, tipo: 'cliente' }, { transaction });
        throw ApiError.badRequest('Fallo al aplicar la relación');
      },
    };
    const valid = {
      ...row(),
      row: 3,
      status: 'valid' as const,
      existingId: undefined,
      apply: async (transaction: Parameters<NonNullable<ImportPlanRow['apply']>>[0]) => {
        await Client.create({ nombre: `${prefix} success`, tipo: 'cliente' }, { transaction });
      },
    };
    const planned = [invalid, valid];
    try {
      const preview = await execute(planned, actor, true);
      const result = await execute(planned, { ...actor, previewToken: preview.previewToken });
      expect(result).toMatchObject({ created: 1, failed: 1 });
      expect(await Client.findOne({ where: { nombre: `${prefix} rollback` } })).toBeNull();
      expect(await Client.findOne({ where: { nombre: `${prefix} success` } })).not.toBeNull();
    } finally {
      await Client.destroy({
        where: { nombre: [`${prefix} rollback`, `${prefix} success`] },
        force: true,
      });
    }
  });
});
