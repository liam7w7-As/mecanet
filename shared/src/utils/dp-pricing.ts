import { calculateQuotationPricing, getQuotationTaxBreakdown } from './quotation-pricing.js';
import { dpConfigurationSchema, dpQuoteInputSchema } from '../schemas/dp-configuration.schema.js';

import type { DpConfiguration, DpQuoteInput, DpQuoteLine, DpWorkQuote } from '../schemas/dp-configuration.schema.js';

export type DpPricingErrorCode = 'STALE_CONFIGURATION' | 'INVALID_SELECTION' | 'MISSING_TARIFF' | 'INVALID_PRICE';

export class DpPricingError extends Error {
  constructor(public readonly code: DpPricingErrorCode, message: string) {
    super(message);
    this.name = 'DpPricingError';
  }
}

type Fraction = { numerator: bigint; denominator: bigint };
type Formula = DpQuoteLine['formula'];
const MAX_CENTS = 999_999_999_999n;
const PRICE_FIELDS = new Set([
  'basePrice', 'factor', 'paintingFactor', 'repairFactor', 'dismantlingFactor',
  'multiplier', 'increment', 'descuentoTipo', 'descuentoValor',
]);

function invalidSelection(message: string): never {
  throw new DpPricingError('INVALID_SELECTION', message);
}

// Convert validated decimals, including scientific notation, before multiplying.
// This avoids floating-point errors at a half-cent boundary and rounds only once.
function fraction(value: number): Fraction {
  const [coefficient, exponent = '0'] = value.toString().toLowerCase().split('e');
  const [whole, decimals = ''] = coefficient.split('.');
  const scale = decimals.length - Number(exponent);
  const numerator = BigInt(whole + decimals);
  return scale < 0
    ? { numerator: numerator * 10n ** BigInt(-scale), denominator: 1n }
    : { numerator, denominator: 10n ** BigInt(scale) };
}

function add(left: Fraction, right: Fraction): Fraction {
  return {
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

function moneyProduct(factors: readonly Fraction[]): number {
  const product = factors.reduce((result, item) => ({
    numerator: result.numerator * item.numerator,
    denominator: result.denominator * item.denominator,
  }), { numerator: 1n, denominator: 1n });
  const cents = (product.numerator * 200n + product.denominator) / (product.denominator * 2n);
  if (cents < 0n || cents > MAX_CENTS) {
    throw new DpPricingError('INVALID_PRICE', 'El importe D&P supera el límite monetario permitido');
  }
  return Number(cents) / 100;
}

function pieceFactorFor(formula: Formula, rate: DpConfiguration['rates'][number] | null): number {
  if (formula === 'fixed') return 1;
  if (!rate) invalidSelection('Esta operación requiere una pieza y ubicación válidas');
  switch (formula) {
    case 'painting': return rate.paintingFactor;
    case 'repair': return rate.repairFactor;
    case 'dismantling': return rate.dismantlingFactor;
  }
}

/**
 * Quote one D&P work with an immutable-by-copy selection, tariff breakdown and
 * five-step template snapshot. Discounts are explicit per operation, never automatic.
 */
export function calculateDpWorkQuote(
  configuration: DpConfiguration,
  selection: DpQuoteInput,
  revision: number,
): DpWorkQuote {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    invalidSelection('La revisión de configuración debe ser un entero positivo válido');
  }
  const inputResult = dpQuoteInputSchema.safeParse(selection);
  if (!inputResult.success) {
    const issue = inputResult.error.issues[0];
    const code = issue.path.some((part) => PRICE_FIELDS.has(String(part))) ? 'INVALID_PRICE' : 'INVALID_SELECTION';
    throw new DpPricingError(code, `Selección D&P inválida: ${issue.message}`);
  }
  const input = inputResult.data;
  if (!Number.isSafeInteger(input.configurationRevision)) invalidSelection('La revisión seleccionada no es válida');
  if (input.configurationRevision !== revision) {
    throw new DpPricingError('STALE_CONFIGURATION', 'Las tarifas D&P cambiaron; actualiza la selección antes de confirmar');
  }
  const configResult = dpConfigurationSchema.safeParse(configuration);
  if (!configResult.success) {
    const issue = configResult.error.issues[0];
    const code = issue.path.some((part) => PRICE_FIELDS.has(String(part))) ? 'INVALID_PRICE' : 'INVALID_SELECTION';
    throw new DpPricingError(code, `Configuración D&P inválida: ${issue.message}`);
  }
  // Zod parses a deep copy: later edits to configuration/input cannot change this snapshot.
  const config = configResult.data;
  const body = config.bodyTypes.find((entry) => entry.id === input.bodyTypeId);
  if (!body?.active) invalidSelection('La carrocería seleccionada no existe o está inactiva');
  const size = body.sizes.find((entry) => entry.id === input.sizeId);
  if (!size?.active) invalidSelection('El tamaño seleccionado no está disponible para esta carrocería');

  const piece = input.scope === 'piece' ? config.pieces.find((entry) => entry.id === input.pieceId) : null;
  const rate = input.scope === 'piece' ? config.rates.find((entry) =>
    entry.bodyTypeId === body.id && entry.pieceId === input.pieceId && entry.positionId === input.positionId) : null;
  if (input.scope === 'piece' && (!piece?.active || !rate?.active)) {
    invalidSelection('La pieza y su ubicación no están disponibles para esta carrocería');
  }

  const selected = input.operations.map((entry) => {
    const operation = config.operations.find((candidate) => candidate.id === entry.operationId);
    if (!operation?.active) invalidSelection(`La operación '${entry.operationId}' no existe o está inactiva`);
    if (operation.scope !== input.scope && operation.scope !== 'additional') {
      invalidSelection(`'${operation.label}' no corresponde al alcance seleccionado`);
    }
    const table = config.tables.find((candidate) => candidate.id === operation.tableId);
    if (!table?.active) invalidSelection(`La tabla de '${operation.label}' no existe o está inactiva`);
    if (operation.requiresDamage && table.formula !== 'repair') {
      invalidSelection(`'${operation.label}' solicita daño pero no utiliza una fórmula de reparación`);
    }
    return { entry, operation, table };
  });

  if (input.scope === 'piece') {
    for (const formula of ['painting', 'repair'] as const) {
      if (selected.filter(({ table }) => table.formula === formula).length > 1) {
        invalidSelection(formula === 'painting'
          ? 'Selecciona una sola modalidad de pintura por pieza'
          : 'Selecciona una sola variante de reparación por pieza');
      }
    }
  }
  const hasRepair = selected.some(({ table }) => table.formula === 'repair');
  if (input.damageLevelId && !hasRepair) invalidSelection('El nivel de daño solo se aplica a una reparación');
  const damage = input.damageLevelId ? config.damageLevels.find((entry) => entry.id === input.damageLevelId) : null;
  if (input.damageLevelId && !damage?.active) invalidSelection('El nivel de daño no existe o está inactivo');
  if (selected.some(({ operation }) => operation.requiresDamage) && !damage) {
    invalidSelection('Selecciona el nivel de daño de la reparación');
  }

  const breakdown = selected.map(({ operation, table }): DpQuoteLine => {
    if (table.basePrice === null || operation.multiplier === null) {
      throw new DpPricingError('MISSING_TARIFF', `La tarifa de '${operation.label}' está pendiente de configuración`);
    }
    const vehicleFactor = table.formula === 'fixed' ? 1 : size.factor;
    const pieceFactor = pieceFactorFor(table.formula, rate ?? null);
    const damageIncrement = table.formula === 'repair' ? damage?.increment ?? 0 : 0;
    const adjustedVehicleFactor = add(fraction(vehicleFactor), fraction(damageIncrement));
    const bruto = moneyProduct([
      fraction(table.basePrice), adjustedVehicleFactor, fraction(pieceFactor), fraction(operation.multiplier),
    ]);
    return {
      operationId: operation.id, label: operation.label, tableId: table.id, formula: table.formula,
      basePrice: table.basePrice, vehicleFactor, pieceFactor, damageIncrement, multiplier: operation.multiplier,
      bruto, descuentoMonto: 0, subtotal: bruto,
    };
  });

  let pricing: ReturnType<typeof calculateQuotationPricing>;
  try {
    pricing = calculateQuotationPricing(breakdown.map((line, index) => ({
      cantidad: 1, precioUnitario: line.bruto,
      descuentoTipo: selected[index].entry.descuentoTipo,
      descuentoValor: selected[index].entry.descuentoValor,
    })));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Importe o descuento fuera del límite permitido';
    throw new DpPricingError('INVALID_PRICE', detail);
  }
  const tax = getQuotationTaxBreakdown(pricing.total);
  // The gross total must fit the same monetary boundary as the net and lines.
  moneyProduct([fraction(tax.total)]);

  return {
    configurationRevision: revision, selection: input,
    bodyTypeLabel: body.label, sizeLabel: size.label, pieceLabel: piece?.label ?? null,
    positionLabel: rate?.positionLabel ?? null, damageLabel: damage?.label ?? null, vehicleFactor: size.factor,
    lines: breakdown.map((line, index) => ({ ...line, ...pricing.lines[index] })),
    subtotal: pricing.subtotal, descuentoOperaciones: pricing.descuentoLineas, precioUnitario: pricing.total,
    ...tax,
    stages: config.stages.map((stage) => ({ ...stage, specialties: [...stage.specialties] })),
  };
}
