import { z } from 'zod';

import { DP_STAGE_KEYS } from '../constants/catalog-types.js';
import { DISCOUNT_TYPES } from '../utils/quotation-pricing.js';

const id = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Usa letras, números, guion o guion bajo');
const label = z.string().trim().min(1).max(180);
const factor = z.number().finite().positive().max(100);
const price = z.number().finite().min(0).max(9999999999.99).multipleOf(0.01).nullable();
const active = z.boolean();
export const DP_PRICE_FORMULAS = ['painting', 'repair', 'dismantling', 'fixed'] as const;
export const dpStageDefinitionSchema = z
  .object({
    key: z.enum(DP_STAGE_KEYS),
    label,
    specialties: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  })
  .strict();
export const dpConfigurationSchema = z
  .object({
    bodyTypes: z
      .array(
        z
          .object({
            id,
            label,
            active,
            sizes: z.array(z.object({ id, label, factor, active }).strict()).min(1).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    pieces: z.array(z.object({ id, label, active }).strict()).min(1).max(300),
    rates: z
      .array(
        z
          .object({
            bodyTypeId: id,
            pieceId: id,
            positionId: id,
            positionLabel: label,
            paintingFactor: factor,
            repairFactor: factor,
            dismantlingFactor: factor,
            active,
          })
          .strict(),
      )
      .max(5000),
    tables: z
      .array(
        z
          .object({ id, label, formula: z.enum(DP_PRICE_FORMULAS), basePrice: price, active })
          .strict(),
      )
      .min(1)
      .max(300),
    operations: z
      .array(
        z
          .object({
            id,
            label,
            scope: z.enum(['piece', 'global', 'additional']),
            tableId: id,
            multiplier: factor.nullable(),
            active,
            requiresDamage: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    damageLevels: z
      .array(
        z.object({ id, label, increment: z.number().finite().min(0).max(100), active }).strict(),
      )
      .min(1)
      .max(20),
    stages: z
      .array(dpStageDefinitionSchema)
      .length(5, 'D&P debe conservar sus cinco pasos obligatorios'),
  })
  .strict()
  .superRefine((data, context) => {
    const unique = (values: string[], path: (string | number)[]) => {
      if (new Set(values).size !== values.length)
        context.addIssue({
          code: 'custom',
          path,
          message: 'Los identificadores no se pueden repetir',
        });
    };
    for (const key of ['bodyTypes', 'pieces', 'tables', 'operations', 'damageLevels'] as const)
      unique(
        data[key].map((row) => row.id),
        [key],
      );
    unique(
      data.stages.map((stage) => stage.key),
      ['stages'],
    );
    for (const [index, body] of data.bodyTypes.entries())
      unique(
        body.sizes.map((size) => size.id),
        ['bodyTypes', index, 'sizes'],
      );
    const bodies = new Set(data.bodyTypes.map((body) => body.id));
    const pieces = new Set(data.pieces.map((piece) => piece.id));
    const tables = new Map(data.tables.map((table) => [table.id, table]));
    unique(
      data.rates.map((rate) => `${rate.bodyTypeId}:${rate.pieceId}:${rate.positionId}`),
      ['rates'],
    );
    for (const [index, rate] of data.rates.entries()) {
      if (!bodies.has(rate.bodyTypeId) || !pieces.has(rate.pieceId))
        context.addIssue({
          code: 'custom',
          path: ['rates', index],
          message: 'La tarifa debe referenciar una carrocería y pieza existentes',
        });
    }
    for (const [index, operation] of data.operations.entries()) {
      const table = tables.get(operation.tableId);
      if (!table)
        context.addIssue({
          code: 'custom',
          path: ['operations', index, 'tableId'],
          message: 'Selecciona una tabla de precios existente',
        });
      if (table && operation.scope === 'global' && table.formula !== 'fixed')
        context.addIssue({
          code: 'custom',
          path: ['operations', index],
          message: 'Los servicios globales deben tener una tarifa global propia',
        });
    }
  });

const discountFields = {
  descuentoTipo: z.enum(DISCOUNT_TYPES).nullable().optional(),
  descuentoValor: z.number().finite().min(0).max(9999999999.99).multipleOf(0.01).optional(),
};
export const dpQuoteInputSchema = z
  .object({
    configurationRevision: z.number().int().positive(),
    bodyTypeId: id,
    sizeId: id,
    pieceId: id.optional(),
    positionId: id.optional(),
    damageLevelId: id.optional(),
    scope: z.enum(['piece', 'global']).default('piece'),
    operations: z
      .array(z.object({ operationId: id, ...discountFields }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((data, context) => {
    if (new Set(data.operations.map((entry) => entry.operationId)).size !== data.operations.length)
      context.addIssue({
        code: 'custom',
        path: ['operations'],
        message: 'Una operación no puede cobrarse dos veces en el mismo trabajo',
      });
    if (data.scope === 'piece' && (!data.pieceId || !data.positionId))
      context.addIssue({
        code: 'custom',
        path: ['pieceId'],
        message: 'Selecciona la pieza y su ubicación',
      });
    if (data.scope === 'global' && (data.pieceId || data.positionId))
      context.addIssue({
        code: 'custom',
        path: ['pieceId'],
        message: 'Un servicio global corresponde al vehículo completo',
      });
  });
export const updateDpConfigurationSchema = z
  .object({ expectedRevision: z.number().int().positive(), configuration: dpConfigurationSchema })
  .strict();
export const dpConfigurationRecordSchema = z.object({
  revision: z.number().int().positive(),
  configuration: dpConfigurationSchema,
  updatedAt: z.string().datetime(),
  lastEditor: z.object({ id: z.number().int().positive(), nombre: z.string() }).nullable(),
});

export type DpConfiguration = z.infer<typeof dpConfigurationSchema>;
export type DpStageDefinition = z.infer<typeof dpStageDefinitionSchema>;
export type DpQuoteInput = z.infer<typeof dpQuoteInputSchema>;
export type DpQuoteRequest = z.input<typeof dpQuoteInputSchema>;
export type UpdateDpConfigurationInput = z.infer<typeof updateDpConfigurationSchema>;
export type DpConfigurationRecord = z.infer<typeof dpConfigurationRecordSchema>;
export interface DpQuoteLine {
  operationId: string;
  label: string;
  tableId: string;
  formula: (typeof DP_PRICE_FORMULAS)[number];
  basePrice: number;
  vehicleFactor: number;
  pieceFactor: number;
  damageIncrement: number;
  multiplier: number;
  bruto: number;
  descuentoMonto: number;
  subtotal: number;
}
export interface DpWorkQuote {
  configurationRevision: number;
  selection: DpQuoteInput;
  bodyTypeLabel: string;
  sizeLabel: string;
  pieceLabel: string | null;
  positionLabel: string | null;
  damageLabel: string | null;
  vehicleFactor: number;
  lines: DpQuoteLine[];
  subtotal: number;
  descuentoOperaciones: number;
  precioUnitario: number;
  neto: number;
  iva: number;
  total: number;
  stages: DpStageDefinition[];
}
