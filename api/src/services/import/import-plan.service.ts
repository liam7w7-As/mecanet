import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { UniqueConstraintError } from 'sequelize';

import { sequelize } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { hasPermission } from '../permission.service.js';

import type { SpreadsheetData, SpreadsheetRow, SpreadsheetValue } from './spreadsheet.service.js';
import type {
  ImportCellValue,
  ImportChange,
  ImportModule,
  ImportPreview,
  ImportResult,
  ImportRowPreview,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';

export interface ImportContext {
  userId?: number;
  role?: string;
  warehouseId?: number;
  previewToken?: string;
}
export type ImportActor = ImportContext | string | undefined;
export const importContext = (actor?: ImportActor): ImportContext =>
  typeof actor === 'string' ? { role: actor } : (actor ?? {});
export interface ImportAccess {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canStock: boolean;
}
export interface ImportPlanRow extends ImportRowPreview {
  snapshot: unknown;
  apply?: (transaction: Transaction) => Promise<{ clientsCreated?: number } | void>;
}
export const hasCell = (value: SpreadsheetValue | undefined): boolean =>
  value !== null && value !== undefined && String(value).trim() !== '';
export const importRecordId = (row: SpreadsheetRow): number | null => {
  if (!hasCell(row.values.id)) return null;
  const text = String(row.values.id).trim();
  const id = Number(text);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(id) || id > 2_147_483_647) {
    throw ApiError.badRequest('El ID debe ser un entero positivo sin texto ni decimales');
  }
  return id;
};
export const importCell = (value: unknown): ImportCellValue =>
  value === null || value === undefined
    ? null
    : value instanceof Date
      ? value.toISOString()
      : typeof value === 'number'
        ? value
        : typeof value === 'boolean'
          ? value
            ? 'Sí'
            : 'No'
          : String(value);
export const changesBetween = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string> = {},
): ImportChange[] =>
  Object.entries(after).flatMap(([field, value]) =>
    importCell(before[field]) === importCell(value)
      ? []
      : [
          {
            field,
            label: labels[field] ?? field,
            before: importCell(before[field]),
            after: importCell(value),
          },
        ],
  );

export const getImportAccess = async (
  module: ImportModule,
  context: ImportContext,
): Promise<ImportAccess> => {
  const administrator = context.role === 'admin' || context.role === 'desarrollador';
  if (administrator) return { canRead: true, canCreate: true, canUpdate: true, canStock: true };
  if (!context.userId)
    return { canRead: false, canCreate: false, canUpdate: false, canStock: false };
  const userId = context.userId;
  const modules =
    module === 'fleet-vehicles'
      ? ['flota']
      : module === 'catalog'
        ? ['taller', 'admin']
        : ['taller', 'comercial'];
  const can = async (action: string) =>
    (
      await Promise.all(
        (action === 'read' && module === 'catalog' ? ['taller', 'comercial'] : modules).map(
          (area) => hasPermission(userId, area, action),
        ),
      )
    ).some(Boolean);
  const [canRead, canCreate, canUpdate, stockRead, stockCreate] = await Promise.all([
    can('read'),
    can('create'),
    can('update'),
    hasPermission(userId, 'almacen', 'read'),
    hasPermission(userId, 'almacen', 'create'),
  ]);
  return { canRead, canCreate, canUpdate, canStock: stockRead && stockCreate };
};
export const applyImportAccess = (row: ImportPlanRow, access: ImportAccess): ImportPlanRow => {
  if (row.existingId && !access.canRead)
    return {
      row: row.row,
      label: `Fila ${row.row}`,
      status: 'conflict',
      values: {},
      changes: [],
      messages: ['No tienes permiso de lectura para revisar este registro existente.'],
      snapshot: row.snapshot,
    };
  if (
    (row.status === 'valid' && !access.canCreate) ||
    (row.status === 'update' && !access.canUpdate)
  )
    return {
      ...row,
      status: 'conflict',
      apply: undefined,
      messages: [
        ...row.messages,
        `No tienes permiso para ${row.status === 'valid' ? 'crear' : 'actualizar'} este registro.`,
      ],
    };
  return row;
};

const publicRow = (
  { row, status, label, values, messages, existingId, changes }: ImportPlanRow,
  privateFields: string[] = [],
): ImportRowPreview => ({
  row,
  status,
  label,
  values: Object.fromEntries(
    Object.entries(values).filter(([field]) => !privateFields.includes(field)),
  ),
  messages,
  ...(existingId ? { existingId } : {}),
  changes: (changes ?? []).filter(({ field }) => !privateFields.includes(field)),
});
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry,
  );
const digest = (rows: ImportPlanRow[]): string =>
  createHash('sha256')
    .update(canonical(rows.map((row) => ({ ...publicRow(row), snapshot: row.snapshot }))))
    .digest('hex');
const fileDigest = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');
interface PreviewClaims {
  module: ImportModule;
  userId: number;
  warehouseId: number | null;
  file: string;
  plan: string;
  expires: number;
}
const signature = (payload: string) =>
  createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`unithor-import-preview-v1:${payload}`)
    .digest();
const issuePreview = (
  module: ImportModule,
  buffer: Buffer,
  rows: ImportPlanRow[],
  context: ImportContext,
): string | undefined => {
  if (!context.userId) return undefined;
  const claims: PreviewClaims = {
    module,
    userId: context.userId,
    warehouseId: context.warehouseId ?? null,
    file: fileDigest(buffer),
    plan: digest(rows),
    expires: Date.now() + 30 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
};
const assertPreview = (
  module: ImportModule,
  buffer: Buffer,
  rows: ImportPlanRow[],
  context: ImportContext,
): void => {
  const invalid = () =>
    ApiError.conflict(
      'El archivo, los permisos o los registros cambiaron. Revisa nuevamente la vista previa antes de confirmar.',
      'IMPORT_PREVIEW_CHANGED',
    );
  if (!context.userId || !context.previewToken)
    throw ApiError.badRequest(
      'Primero revisa la vista previa del archivo.',
      undefined,
      'IMPORT_PREVIEW_REQUIRED',
    );
  try {
    const [payload, mac, extra] = context.previewToken.split('.');
    if (!payload || !mac || extra) throw invalid();
    const expected = signature(payload);
    const actual = Buffer.from(mac, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid();
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PreviewClaims;
    if (
      claims.module !== module ||
      claims.userId !== context.userId ||
      claims.warehouseId !== (context.warehouseId ?? null) ||
      claims.expires <= Date.now() ||
      claims.file !== fileDigest(buffer) ||
      claims.plan !== digest(rows)
    )
      throw invalid();
  } catch {
    throw invalid();
  }
};
export const buildImportPreview = (
  module: ImportModule,
  buffer: Buffer,
  fileName: string,
  sheet: SpreadsheetData,
  rows: ImportPlanRow[],
  context: ImportContext,
  privateFields: string[] = [],
): ImportPreview => {
  const hidden = new Set(privateFields);
  return {
    module,
    fileName,
    sheetName: sheet.sheetName,
    headerRow: sheet.headerRow,
    headers: sheet.headers.filter(
      (header) => !privateFields.some((field) => sheet.mappedColumns[field] === header),
    ),
    mappedColumns: Object.fromEntries(
      Object.entries(sheet.mappedColumns).filter(([field]) => !hidden.has(field)),
    ),
    missingColumns: sheet.missingColumns,
    totalRows: sheet.totalRows,
    validRows: rows.filter((row) => row.status === 'valid' || row.status === 'update').length,
    newRows: rows.filter((row) => row.status === 'valid').length,
    updateRows: rows.filter((row) => row.status === 'update').length,
    unchangedRows: rows.filter((row) => row.status === 'unchanged').length,
    conflictRows: rows.filter((row) => row.status === 'conflict').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate').length,
    errorRows: rows.filter((row) => row.status === 'error').length,
    rows: rows.slice(0, 200).map((row) => publicRow(row, privateFields)),
    truncated: sheet.truncated,
    maxRows: sheet.maxRows,
    previewToken: issuePreview(module, buffer, rows, context),
    warehouseId: context.warehouseId,
  };
};

export const executePlannedImport = async (
  module: ImportModule,
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
  sheet: SpreadsheetData,
  context: ImportContext,
  prepare: (transaction?: Transaction) => Promise<ImportPlanRow[]>,
  privateFields: string[] = [],
): Promise<ImportResult> => {
  if (sheet.truncated)
    throw ApiError.badRequest(
      `El archivo supera el máximo de ${sheet.maxRows} filas. Divide la planilla para revisar todos los registros.`,
    );
  const execute = async (
    rows: ImportPlanRow[],
    transaction?: Transaction,
  ): Promise<ImportResult> => {
    const preview = buildImportPreview(
      module,
      buffer,
      fileName,
      sheet,
      rows,
      context,
      privateFields,
    );
    if (dryRun)
      return {
        ...preview,
        created: 0,
        updated: 0,
        unchanged: preview.unchangedRows ?? 0,
        conflicts: preview.conflictRows ?? 0,
        skipped: preview.duplicateRows,
        failed: preview.errorRows,
        clientsCreated: 0,
      };
    assertPreview(module, buffer, rows, context);
    if (!transaction) throw ApiError.internal('Importación sin transacción');
    let created = 0;
    let updated = 0;
    let failed = preview.errorRows;
    let clientsCreated = 0;
    const resultRows: ImportRowPreview[] = [];
    for (const [index, row] of rows.entries()) {
      if (!['valid', 'update'].includes(row.status) || !row.apply) {
        resultRows.push(publicRow(row, privateFields));
        continue;
      }
      // Sequelize 6 reuses savepoint names at different nesting depths.
      // Inventory helpers use findOrCreate (another nested savepoint), so a
      // distinct SQL name protects the WHOLE row, including its metadata.
      // The identifier only contains this loop's numeric index, never file data.
      const savepoint = `unithor_import_row_${index}`;
      await sequelize.query(`SAVEPOINT ${savepoint}`, { transaction });
      try {
        const outcome = await row.apply(transaction);
        await sequelize.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction });
        clientsCreated += outcome?.clientsCreated ?? 0;
        if (row.status === 'valid') created++;
        else updated++;
        resultRows.push({
          ...publicRow(row, privateFields),
          status: row.status === 'valid' ? 'created' : 'updated',
        });
      } catch (error) {
        await sequelize.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, { transaction });
        await sequelize.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction });
        failed++;
        resultRows.push({
          ...publicRow(row, privateFields),
          status: 'error',
          messages: [
            ...row.messages,
            error instanceof UniqueConstraintError
              ? 'El registro colisionó con otro existente. Revisa la planilla.'
              : error instanceof ApiError
                ? error.message
                : 'No se aplicaron los cambios de esta fila. Puedes revisar e intentar nuevamente.',
          ],
        });
      }
    }
    return {
      ...preview,
      previewToken: undefined,
      rows: resultRows.slice(0, 200),
      created,
      updated,
      unchanged: preview.unchangedRows ?? 0,
      conflicts: preview.conflictRows ?? 0,
      skipped: preview.duplicateRows + (preview.unchangedRows ?? 0) + (preview.conflictRows ?? 0),
      failed,
      validRows: created + updated,
      errorRows: failed,
      clientsCreated,
    };
  };
  if (dryRun) return execute(await prepare());
  return sequelize.transaction(async (transaction) =>
    execute(await prepare(transaction), transaction),
  );
};
