import { createCatalogItemSchema } from '@unithor/shared';
import { Transaction } from 'sequelize';

import { CATALOG_IMPORT_COLUMNS, aliasesOf } from './import-columns.js';
import {
  applyImportAccess,
  changesBetween,
  executePlannedImport,
  getImportAccess,
  hasCell,
  importCell,
  importContext,
  importRecordId,
} from './import-plan.service.js';
import {
  normalizeKeyText,
  parseIntegerValue,
  parseNumberValue,
  parseTextValue,
  readSpreadsheet,
  upperTextValue,
} from './spreadsheet.service.js';
import { CatalogItem } from '../../models/CatalogItem.js';
import { StockBalance } from '../../models/StockBalance.js';
import { Warehouse } from '../../models/Warehouse.js';
import { registerMovement } from '../warehouse.service.js';

import type { ImportActor, ImportContext, ImportPlanRow } from './import-plan.service.js';
import type { SpreadsheetData } from './spreadsheet.service.js';
import type { ImportPreview, ImportResult } from '@unithor/shared';

interface CatalogMetadata {
  tipo: 'parte' | 'estandar' | 'especifico';
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  unidadMedida: 'unidad' | 'litro' | 'mililitro' | 'kilogramo' | 'juego' | 'servicio';
  precio: number;
  stockMinimo: number;
  horasHombreEstandar: number | null;
}

const TIPO_LABELS: Record<string, CatalogMetadata['tipo']> = {
  parte: 'parte',
  repuesto: 'parte',
  repuestos: 'parte',
  pieza: 'parte',
  piezas: 'parte',
  insumo: 'parte',
  material: 'parte',
  producto: 'parte',
  estandar: 'estandar',
  'servicio estandar': 'estandar',
  servicio: 'estandar',
  'mano de obra': 'estandar',
  especifico: 'especifico',
  'servicio especifico': 'especifico',
  trabajo: 'especifico',
  'trabajo especifico': 'especifico',
  mantencion: 'especifico',
};

const UNIDAD_LABELS: Record<string, CatalogMetadata['unidadMedida']> = {
  unidad: 'unidad',
  unidades: 'unidad',
  un: 'unidad',
  u: 'unidad',
  litro: 'litro',
  litros: 'litro',
  lt: 'litro',
  l: 'litro',
  mililitro: 'mililitro',
  mililitros: 'mililitro',
  ml: 'mililitro',
  kilogramo: 'kilogramo',
  kilogramos: 'kilogramo',
  kilo: 'kilogramo',
  kilos: 'kilogramo',
  kg: 'kilogramo',
  juego: 'juego',
  juegos: 'juego',
  set: 'juego',
  servicio: 'servicio',
  servicios: 'servicio',
};

const FIELD_LABELS: Record<string, string> = {
  tipo: 'Tipo',
  codigo: 'Código',
  nombre: 'Nombre',
  descripcion: 'Descripción',
  unidadMedida: 'Unidad de medida',
  precio: 'Precio',
  stockMinimo: 'Stock mínimo',
  horasHombreEstandar: 'Horas hombre estándar',
  stock: 'Stock final en el almacén seleccionado',
};

const normalizedName = (value: string): string => normalizeKeyText(value).replace(/\s+/g, ' ');
const nameKey = (nombre: string, tipo: CatalogMetadata['tipo']): string =>
  `${tipo}:${normalizedName(nombre)}`;

const metadataOf = (item: CatalogItem): CatalogMetadata => ({
  tipo: item.tipo,
  codigo: item.codigo,
  nombre: item.nombre,
  descripcion: item.descripcion,
  unidadMedida: item.unidadMedida,
  precio: Number(item.precio),
  stockMinimo: Number(item.stockMinimo),
  horasHombreEstandar: item.horasHombreEstandar === null ? null : Number(item.horasHombreEstandar),
});

const prepareRows = async (
  sheet: SpreadsheetData,
  fileName: string,
  context: ImportContext,
  transaction?: Transaction,
): Promise<ImportPlanRow[]> => {
  const access = await getImportAccess('catalog', context);
  // Confirmation locks the identity space and inventory before the helper
  // verifies the signed preview and opens each row's savepoint.
  const lock = transaction ? Transaction.LOCK.UPDATE : undefined;
  const items = await CatalogItem.findAll({
    paranoid: false,
    order: [['id', 'ASC']],
    transaction,
    lock,
  });
  const warehouse =
    context.warehouseId === undefined
      ? null
      : await Warehouse.findByPk(context.warehouseId, { transaction, lock });
  const balances = await StockBalance.findAll({
    order: [
      ['catalogItemId', 'ASC'],
      ['warehouseId', 'ASC'],
      ['id', 'ASC'],
    ],
    transaction,
    lock,
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  const byCode = new Map<string, CatalogItem[]>();
  const byName = new Map<string, CatalogItem[]>();
  const byItem = new Map<number, StockBalance[]>();
  for (const item of items) {
    const code = upperTextValue(item.codigo);
    if (code) byCode.set(code, [...(byCode.get(code) ?? []), item]);
    const key = nameKey(item.nombre, item.tipo);
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  for (const balance of balances) {
    byItem.set(balance.catalogItemId, [...(byItem.get(balance.catalogItemId) ?? []), balance]);
  }
  const itemSnapshot = (item: CatalogItem) => ({
    id: item.id,
    ...metadataOf(item),
    stock: Number(item.stock),
    updatedAt: importCell(item.updatedAt),
    deletedAt: importCell(item.deletedAt),
    balances: (byItem.get(item.id) ?? []).map((balance) => ({
      id: balance.id,
      warehouseId: balance.warehouseId,
      cantidad: Number(balance.cantidad),
      updatedAt: importCell(balance.get('updatedAt')),
    })),
  });
  const keysByRow: string[][] = [];
  const plans = sheet.rows.map((row): ImportPlanRow => {
    const messages: string[] = [];
    let id: number | null = null;
    try {
      id = importRecordId(row);
      if (hasCell(row.values.id) && !Number.isSafeInteger(parseNumberValue(row.values.id))) {
        messages.push('El ID debe ser un entero positivo.');
      }
    } catch (error) {
      messages.push(error instanceof Error ? error.message : 'El ID no es válido.');
    }
    const code = upperTextValue(row.values.codigo);
    const name = parseTextValue(row.values.nombre);
    const rawType = parseTextValue(row.values.tipo);
    const type = rawType ? TIPO_LABELS[normalizedName(rawType)] : undefined;
    if (rawType && !type) messages.push(`Tipo no reconocido: "${rawType}".`);
    const candidates = hasCell(row.values.id)
      ? id && byId.has(id)
        ? [byId.get(id)!]
        : []
      : code
        ? (byCode.get(code) ?? [])
        : (byName.get(nameKey(name ?? '', type ?? 'estandar')) ?? []);
    const existing = candidates.length === 1 ? candidates[0] : undefined;
    const before = existing ? metadataOf(existing) : undefined;
    const keys: string[] = [];
    if (id) keys.push(`id:${id}`);
    if (code) keys.push(`code:${code}`);
    if (existing) {
      keys.push(`id:${existing.id}`);
      keys.push(
        existing.codigo
          ? `code:${upperTextValue(existing.codigo)}`
          : `name:${nameKey(existing.nombre, existing.tipo)}`,
      );
    }
    keysByRow.push(keys);
    const plan: ImportPlanRow = {
      row: row.rowNumber,
      label:
        [code ?? before?.codigo, name ?? before?.nombre].filter(Boolean).join(' · ') ||
        `Fila ${row.rowNumber}`,
      status: 'valid',
      values: { ...row.values },
      messages,
      changes: [],
      ...(existing ? { existingId: existing.id } : {}),
      snapshot: {
        access,
        candidates: candidates.map(itemSnapshot),
        warehouse: warehouse
          ? {
              id: warehouse.id,
              codigo: warehouse.codigo,
              nombre: warehouse.nombre,
              activo: warehouse.activo,
            }
          : null,
      },
    };
    const conflict = (message: string): void => {
      plan.status = 'conflict';
      messages.push(message);
    };
    if (hasCell(row.values.id) && !existing && messages.length === 0) {
      conflict('El ID no existe. No se creará un registro ni se buscará por otra clave.');
    }
    if (candidates.length > 1)
      conflict('La clave coincide con varios registros. Indica un ID inequívoco.');
    if (existing?.deletedAt)
      conflict('El registro está eliminado. La importación no restaura registros.');

    const numeric = (field: string, fallback: number | null, integer = false): number | null => {
      if (!hasCell(row.values[field])) return fallback;
      const number = parseNumberValue(row.values[field]);
      const parsed = integer ? parseIntegerValue(row.values[field]) : number;
      if (number === null || (integer && (!Number.isSafeInteger(number) || number !== parsed))) {
        messages.push(
          `${FIELD_LABELS[field]}: debe ser un número ${integer ? 'entero ' : ''}válido.`,
        );
        return fallback;
      }
      if (integer && number > 2_147_483_647)
        messages.push(`${FIELD_LABELS[field]}: excede el máximo permitido.`);
      return number;
    };
    const rawUnit = parseTextValue(row.values.unidadMedida);
    const unit = rawUnit
      ? UNIDAD_LABELS[normalizedName(rawUnit)]
      : (before?.unidadMedida ?? 'unidad');
    if (!unit) messages.push(`Unidad de medida no reconocida: "${rawUnit}".`);
    const suppliedStock = hasCell(row.values.stock);
    const requestedStock = numeric('stock', 0, true) ?? 0;
    const after: CatalogMetadata = {
      tipo: type ?? before?.tipo ?? (code ? 'parte' : 'estandar'),
      codigo: code ?? before?.codigo ?? null,
      nombre: name ?? before?.nombre ?? '',
      descripcion: parseTextValue(row.values.descripcion) ?? before?.descripcion ?? null,
      unidadMedida: unit ?? 'unidad',
      precio: numeric('precio', before?.precio ?? 0) ?? 0,
      stockMinimo: numeric('stockMinimo', before?.stockMinimo ?? 0, true) ?? 0,
      horasHombreEstandar: numeric('horasHombreEstandar', before?.horasHombreEstandar ?? null),
    };
    const stockOperation = suppliedStock && after.tipo === 'parte';
    const targetStock = after.tipo === 'parte' ? requestedStock : 0;
    const parsed = createCatalogItemSchema.safeParse({ ...after, stock: targetStock });
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        messages.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    const finalCode = upperTextValue(after.codigo);
    keys.push(finalCode ? `code:${finalCode}` : `name:${nameKey(after.nombre, after.tipo)}`);
    const collisions = finalCode
      ? (byCode.get(finalCode) ?? [])
      : (byName.get(nameKey(after.nombre, after.tipo)) ?? []);
    const identityChanged =
      !before ||
      finalCode !== upperTextValue(before.codigo) ||
      (!finalCode && nameKey(after.nombre, after.tipo) !== nameKey(before.nombre, before.tipo));
    if (identityChanged && collisions.some((item) => item.id !== existing?.id)) {
      conflict(
        'El código o el nombre y tipo sin código pertenecen a otro registro, posiblemente eliminado.',
      );
    }
    const itemBalances = existing ? (byItem.get(existing.id) ?? []) : [];
    const totalStock = itemBalances.reduce((sum, balance) => sum + Number(balance.cantidad), 0);
    const currentStock = Number(
      itemBalances.find((balance) => balance.warehouseId === context.warehouseId)?.cantidad ?? 0,
    );
    const stockChanged = stockOperation && targetStock !== currentStock;
    plan.values = {
      ...after,
      stock: suppliedStock ? targetStock : null,
      ...(id ? { id } : {}),
      stockGlobal: existing ? Number(existing.stock) : 0,
      stockTotalAlmacenes: totalStock,
      stockAlmacenActual: warehouse ? currentStock : null,
      warehouseId: warehouse?.id ?? context.warehouseId ?? null,
      almacen: warehouse ? `${warehouse.codigo} · ${warehouse.nombre}` : null,
    };
    plan.changes = changesBetween(before ? { ...before } : {}, { ...after }, FIELD_LABELS);
    if (suppliedStock && (!existing || (stockOperation && (warehouse || stockChanged)))) {
      plan.changes.push(
        ...changesBetween(
          { stock: existing && warehouse ? currentStock : null },
          { stock: targetStock },
          {
            ...FIELD_LABELS,
            stock: warehouse ? `Stock final en ${warehouse.codigo}` : FIELD_LABELS.stock,
          },
        ),
      );
    }

    if (
      existing?.tipo === 'parte' &&
      after.tipo !== 'parte' &&
      (Number(existing.stock) > 0 || itemBalances.some((balance) => Number(balance.cantidad) > 0))
    ) {
      conflict(
        'No se puede convertir un repuesto en servicio mientras tenga stock global o saldos positivos.',
      );
    }
    if (stockOperation && existing && Number(existing.stock) !== totalStock) {
      conflict(
        'El stock global no coincide con la suma de los saldos por almacén. Requiere conciliación previa; importa solo metadatos dejando Stock vacío.',
      );
    }
    const requiresWarehouse =
      stockChanged || (stockOperation && !warehouse && (targetStock > 0 || totalStock > 0));
    if (requiresWarehouse && (!warehouse || !warehouse.activo)) {
      conflict(
        'Selecciona un almacén activo para modificar el stock. Stock es el saldo final de ese almacén.',
      );
    }
    if (requiresWarehouse && (!access.canStock || !context.userId)) {
      conflict('Necesitas permisos almacen.read y almacen.create para modificar stock.');
    }
    if (plan.status !== 'conflict' && messages.length > 0) plan.status = 'error';
    if (suppliedStock && after.tipo !== 'parte') {
      messages.push(
        'El stock informado se ignora para servicios y se normaliza a 0. No se registrará ningún movimiento de almacén.',
      );
    }
    if (plan.status === 'valid' && existing)
      plan.status = plan.changes.length > 0 ? 'update' : 'unchanged';
    if (plan.status === 'valid' || plan.status === 'update') {
      plan.apply = async (savepoint) => {
        const metadataChanges = changesBetween(before ? { ...before } : {}, { ...after });
        const patch = Object.fromEntries(
          metadataChanges.map(({ field }) => [field, after[field as keyof CatalogMetadata]]),
        );
        const item =
          existing ??
          (await CatalogItem.create({ ...after, stock: 0 }, { transaction: savepoint }));
        if (existing && metadataChanges.length > 0)
          await item.update(patch, { transaction: savepoint });
        // registerMovement synchronizes global stock from ALL warehouse balances.
        // A zero final balance is recorded as a full salida.
        if (stockChanged) {
          await registerMovement(
            {
              catalogItemId: item.id,
              warehouseId: warehouse!.id,
              tipo: targetStock === 0 ? 'salida' : 'ajuste',
              cantidad: targetStock === 0 ? currentStock : targetStock,
              motivo: `Importación de catálogo, fila ${row.rowNumber}: saldo final`,
            },
            context.userId!,
            {
              transaction: savepoint,
              referencia: `IMPORT-CATALOG:${fileName}`.slice(0, 100) + `:F${row.rowNumber}`,
            },
          );
        }
      };
    }
    return plan;
  });

  // Mark every member of a repeated target/key group, including its first row.
  const owners = new Map<string, Set<number>>();
  keysByRow.forEach((keys, index) => {
    for (const key of keys) owners.set(key, (owners.get(key) ?? new Set()).add(index));
  });
  const repeated = new Set(
    [...owners.values()].filter((indices) => indices.size > 1).flatMap((indices) => [...indices]),
  );
  return plans.map((plan, index) =>
    applyImportAccess(
      repeated.has(index)
        ? {
            ...plan,
            status: 'conflict',
            apply: undefined,
            messages: [
              ...plan.messages,
              'El archivo repite el mismo registro o clave en varias filas. Resuelve todas las repeticiones.',
            ],
          }
        : plan,
      access,
    ),
  );
};

const readCatalogSpreadsheet = (buffer: Buffer, fileName: string): Promise<SpreadsheetData> =>
  readSpreadsheet(buffer, {
    aliases: aliasesOf(CATALOG_IMPORT_COLUMNS),
    required: ['nombre'],
    fileName,
  });

export const previewCatalogImport = async (
  buffer: Buffer,
  fileName: string,
  actor?: ImportActor,
): Promise<ImportPreview> => importCatalog(buffer, fileName, true, actor);

export const importCatalog = async (
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
  actor?: ImportActor,
): Promise<ImportResult> => {
  const context = importContext(actor);
  const sheet = await readCatalogSpreadsheet(buffer, fileName);
  return executePlannedImport('catalog', buffer, fileName, dryRun, sheet, context, (transaction) =>
    prepareRows(sheet, fileName, context, transaction),
  );
};
