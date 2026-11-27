import { CATALOG_DIVISIONS, CATALOG_SUBTYPES, CATALOG_TYPES, dpQuoteInputSchema, UNIT_MEASURES } from '@unithor/shared';
import { z } from 'zod';

import { quotationRecoverySchema } from './form-recovery.schemas';

const discountType = z.enum(['porcentaje', 'fijo']).nullable();

export const dpQuotationLineSchema = z.object({
  key: z.string(),
  division: z.enum(CATALOG_DIVISIONS),
  subtipo: z.enum(CATALOG_SUBTYPES),
  tipoLinea: z.enum(CATALOG_TYPES),
  catalogItemId: z.number().int().positive().nullable(),
  descripcion: z.string(),
  unidadMedida: z.enum(UNIT_MEASURES),
  cantidad: z.string(),
  precioUnitario: z.string(),
  descuentoTipo: discountType,
  descuentoValor: z.string(),
  esAPedido: z.boolean().optional(),
  dpPricing: dpQuoteInputSchema.optional(),
  dpPricingSnapshot: quotationRecoverySchema.shape.items.element.shape.dpPricingSnapshot,
});

// Store form fields explicitly; session credentials and API response extras are excluded.
export const dpQuotationRecoverySchema = z.object({
  client: quotationRecoverySchema.shape.client,
  vehicleMode: z.enum(['no_plate', 'registered']),
  selectedVehicle: z.object({
    id: z.number().int().positive(),
    patente: z.string(),
    marca: z.string().nullable(),
    modelo: z.string().nullable(),
    ano: z.number().nullable(),
    dpBodyTypeId: z.string().nullish(),
    dpSizeId: z.string().nullish(),
    client: quotationRecoverySchema.shape.client,
  }).nullable(),
  bodyTypeId: z.string(),
  sizeId: z.string(),
  vehicleRef: z.string(),
  items: z.array(dpQuotationLineSchema),
  commercial: quotationRecoverySchema.shape.commercial,
  notas: z.string(),
  workspaceMode: z.enum(['piece', 'global', 'acc']),
  selectedPieceKey: z.string().nullable(),
  editingLineKey: z.string().nullable(),
  opIds: z.array(z.string()),
  damageLevelId: z.string(),
  pieceDiscountType: discountType,
  pieceDiscountValue: z.string(),
  accSearch: z.string(),
  accSubtype: z.enum(['all', 'en_stock', 'a_pedido']),
  createdQuotationId: z.number().int().positive().nullable(),
});

export type DpQuotationLine = z.infer<typeof dpQuotationLineSchema>;
export type DpQuotationRecovery = z.infer<typeof dpQuotationRecoverySchema>;
