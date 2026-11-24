import {
  calculateDpWorkQuote,
  dpConfigurationSchema,
  DpPricingError,
  updateDpConfigurationSchema,
} from '@unithor/shared';

import { publishCatalogChange } from './catalog-events.service.js';
import { sequelize } from '../config/database.js';
import { DpConfiguration, DpConfigurationRevision, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

import type {
  DpConfigurationRecord,
  DpQuoteInput,
  DpWorkQuote,
  UpdateDpConfigurationInput,
} from '@unithor/shared';
import type { Transaction } from 'sequelize';

function parseConfiguration(value: unknown): DpConfigurationRecord['configuration'] {
  let json: unknown = value;
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json) as unknown;
    } catch {
      throw ApiError.internal('La configuración D&P guardada no es válida');
    }
  }
  const result = dpConfigurationSchema.safeParse(json);
  if (!result.success) throw ApiError.internal('La configuración D&P guardada no es válida');
  return result.data;
}

async function loadConfiguration(
  transaction?: Transaction,
  exclusive = false,
): Promise<DpConfiguration> {
  const row = await DpConfiguration.findByPk(1, {
    transaction,
    ...(transaction ? { lock: exclusive ? transaction.LOCK.UPDATE : transaction.LOCK.SHARE } : {}),
  });
  if (!row)
    throw ApiError.internal(
      'La configuración D&P aún no está inicializada. Revisa las migraciones de la aplicación.',
    );
  return row;
}

async function toRecord(
  row: DpConfiguration,
  transaction?: Transaction,
): Promise<DpConfigurationRecord> {
  const editor =
    row.updatedBy === null
      ? null
      : await User.findByPk(row.updatedBy, {
          attributes: ['id', 'nombre'],
          transaction,
          paranoid: false,
        });
  return {
    revision: row.revision,
    configuration: parseConfiguration(row.configuration),
    updatedAt: row.updatedAt.toISOString(),
    lastEditor: editor ? { id: editor.id, nombre: editor.nombre } : null,
  };
}

export async function getDpConfiguration(
  transaction?: Transaction,
): Promise<DpConfigurationRecord> {
  return toRecord(await loadConfiguration(transaction), transaction);
}

export async function updateDpConfiguration(
  input: UpdateDpConfigurationInput,
  userId: number,
): Promise<DpConfigurationRecord> {
  const parsed = updateDpConfigurationSchema.safeParse(input);
  if (!parsed.success)
    throw ApiError.badRequest('Revisa los campos de la configuración D&P', parsed.error.flatten());
  const result = await sequelize.transaction(async (transaction) => {
    const row = await loadConfiguration(transaction, true);
    if (row.revision !== parsed.data.expectedRevision)
      throw ApiError.conflict(
        'La configuración D&P cambió en otra sesión. Recarga la versión vigente antes de guardar.',
        'DP_CONFIGURATION_CHANGED',
      );
    row.configuration = parsed.data.configuration;
    row.revision += 1;
    row.updatedBy = userId;
    await row.save({ transaction });
    await DpConfigurationRevision.create(
      { revision: row.revision, configuration: row.configuration, createdBy: userId },
      { transaction },
    );
    return toRecord(row, transaction);
  });
  publishCatalogChange();
  return result;
}

export async function calculateDpWorkPricing(
  selection: DpQuoteInput,
  transaction?: Transaction,
): Promise<DpWorkQuote> {
  const row = await loadConfiguration(transaction);
  try {
    return calculateDpWorkQuote(parseConfiguration(row.configuration), selection, row.revision);
  } catch (error) {
    if (!(error instanceof DpPricingError)) throw error;
    if (error.code === 'STALE_CONFIGURATION')
      throw ApiError.conflict(error.message, 'DP_CONFIGURATION_CHANGED');
    throw ApiError.unprocessable(error.message, undefined, error.code);
  }
}

export async function getDpConfigurationHistory(): Promise<{
  items: Array<{
    revision: number;
    createdAt: string;
    editor: { id: number; nombre: string } | null;
  }>;
}> {
  const rows = await DpConfigurationRevision.findAll({
    attributes: ['revision', 'createdAt', 'createdBy'],
    include: [{ model: User, as: 'editor', attributes: ['id', 'nombre'], paranoid: false }],
    order: [['revision', 'DESC']],
    limit: 50,
  });
  return {
    items: rows.map((row) => ({
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      editor: row.editor ? { id: row.editor.id, nombre: row.editor.nombre } : null,
    })),
  };
}
