import { describe, expect, it } from 'vitest';
import { createDefaultDpConfiguration } from '../../constants/dp-configuration.js';
import { calculateDpWorkQuote, DpPricingError } from '../dp-pricing.js';
const selection = (patch = {}) => ({
    configurationRevision: 1, scope: 'piece', bodyTypeId: 'hatchback', sizeId: 'S',
    pieceId: 'parachoque', positionId: 'F', operations: [{ operationId: 'painting_full' }], ...patch,
});
function expectCode(action, code) {
    expect(action).toThrowError(expect.objectContaining({ name: 'DpPricingError', code }));
}
describe('Tarifas netas e IVA D&P', () => {
    it('reproduce el ejemplo acordado: pintura, reparación D2 y desmontaje/montaje', () => {
        const quote = calculateDpWorkQuote(createDefaultDpConfiguration(), selection({
            damageLevelId: 'D2', operations: [
                { operationId: 'painting_full' }, { operationId: 'repair_plastic' }, { operationId: 'dismantling' },
            ],
        }), 1);
        expect(quote.lines).toMatchObject([
            { basePrice: 90000, vehicleFactor: 0.85, pieceFactor: 1.1, damageIncrement: 0, bruto: 84150, subtotal: 84150 },
            { basePrice: 20000, vehicleFactor: 0.85, pieceFactor: 1, damageIncrement: 0.5, bruto: 27000, subtotal: 27000 },
            { basePrice: 20000, vehicleFactor: 0.85, pieceFactor: 1.1, damageIncrement: 0, bruto: 18700, subtotal: 18700 },
        ]);
        expect(quote).toMatchObject({ subtotal: 129850, descuentoOperaciones: 0, precioUnitario: 129850,
            neto: 129850, iva: 24672, total: 154522,
            bodyTypeLabel: 'Hatchback', sizeLabel: 'S', pieceLabel: 'Parachoque', positionLabel: 'Delantero', damageLabel: 'D2' });
    });
    it.each([
        ['hatchback', 'S', 'parachoque', 'F', 84150],
        ['hatchback', 'M', 'parachoque', 'F', 99000],
        ['hatchback', 'S', 'parachoque', 'R', 76500],
        ['hatchback', 'M', 'parachoque', 'R', 90000],
        ['hatchback', 'S', 'capo', 'UNICA', 99450],
        ['hatchback', 'M', 'capo', 'UNICA', 117000],
        ['hatchback', 'S', 'guardafango', 'L', 57375],
        ['hatchback', 'S', 'puerta', 'FL', 76500],
        ['hatchback', 'S', 'techo', 'UNICA', 110925],
        ['hatchback', 'S', 'marco_superior', 'R', 26775],
        ['hatchback', 'S', 'pilar', 'AL', 19125],
        ['hatchback', 'S', 'retrovisor', 'R', 15300],
        ['hatchback', 'S', 'moldura_guardafango', 'A', 22950],
        ['hatchback', 'S', 'panel_lateral', 'L', 68850],
        ['hatchback', 'S', 'porton', 'UNICA', 91800],
        ['sedan', 'S', 'capo', 'UNICA', 145350],
        ['suv', 'M', 'parachoque', 'F', 113400],
        ['suv', 'XL', 'techo', 'UNICA', 245700],
        ['pickup', 'L', 'parachoque', 'R', 87975],
        ['pickup', 'XL', 'lateral_pickup', 'L', 210600],
    ])('pintura: %s/%s %s/%s da %s netos', (bodyTypeId, sizeId, pieceId, positionId, expected) => {
        const quote = calculateDpWorkQuote(createDefaultDpConfiguration(), selection({ bodyTypeId, sizeId, pieceId, positionId }), 1);
        expect(quote.neto).toBe(expected);
        expect(quote.descuentoOperaciones).toBe(0);
    });
    it.each([
        ['hatchback', 'S', 'D1', 17000], ['hatchback', 'S', 'D2', 27000], ['hatchback', 'S', 'D3', 37000],
        ['hatchback', 'M', 'D1', 20000], ['hatchback', 'M', 'D2', 30000], ['hatchback', 'M', 'D3', 40000],
        ['suv', 'XL', 'D1', 26000], ['suv', 'XL', 'D2', 36000], ['suv', 'XL', 'D3', 46000],
    ])('reparación: %s/%s %s suma el daño al tamaño y da %s', (bodyTypeId, sizeId, damageLevelId, expected) => {
        const quote = calculateDpWorkQuote(createDefaultDpConfiguration(), selection({
            bodyTypeId, sizeId, damageLevelId, operations: [{ operationId: 'repair_dent' }],
        }), 1);
        expect(quote.neto).toBe(expected);
        expect(quote.lines[0].pieceFactor).toBe(1);
    });
    it('usa las tarifas y multiplicadores editados, no valores fijos en el motor', () => {
        const config = createDefaultDpConfiguration();
        config.tables.find((table) => table.id === 'repair').basePrice = 30000;
        config.damageLevels.find((level) => level.id === 'D2').increment = 0.75;
        config.operations.find((operation) => operation.id === 'repair_dent').multiplier = 1.2;
        config.rates.find((rate) => rate.bodyTypeId === 'hatchback' && rate.pieceId === 'parachoque' && rate.positionId === 'F').repairFactor = 1.5;
        const quote = calculateDpWorkQuote(config, selection({ damageLevelId: 'D2', operations: [{ operationId: 'repair_dent' }] }), 1);
        expect(quote.neto).toBe(86400); // 30000 * (0.85 + 0.75) * 1.5 * 1.2
    });
    it('desmontaje tiene su propia base y factor editables, aunque coincidan inicialmente con pintura', () => {
        const config = createDefaultDpConfiguration();
        config.tables.find((table) => table.id === 'dismantling').basePrice = 25000;
        config.rates.find((rate) => rate.bodyTypeId === 'hatchback' && rate.pieceId === 'parachoque' && rate.positionId === 'F').dismantlingFactor = 2;
        expect(calculateDpWorkQuote(config, selection({ operations: [{ operationId: 'dismantling' }] }), 1).neto).toBe(42500);
        expect(calculateDpWorkQuote(config, selection(), 1).neto).toBe(84150);
    });
    it('aplica solo descuentos manuales por concepto antes del IVA', () => {
        const quote = calculateDpWorkQuote(createDefaultDpConfiguration(), selection({
            damageLevelId: 'D2', operations: [
                { operationId: 'painting_full', descuentoTipo: 'porcentaje', descuentoValor: 10 },
                { operationId: 'repair_plastic', descuentoTipo: 'fijo', descuentoValor: 2000 },
                { operationId: 'dismantling' },
            ],
        }), 1);
        expect(quote.lines).toMatchObject([
            { bruto: 84150, descuentoMonto: 8415, subtotal: 75735 },
            { bruto: 27000, descuentoMonto: 2000, subtotal: 25000 },
            { bruto: 18700, descuentoMonto: 0, subtotal: 18700 },
        ]);
        expect(quote).toMatchObject({ subtotal: 129850, descuentoOperaciones: 10415, precioUnitario: 119435,
            neto: 119435, iva: 22693, total: 142128 });
    });
    it('permite un descuento manual del 100% sin confundirlo con una tarifa pendiente', () => {
        const quote = calculateDpWorkQuote(createDefaultDpConfiguration(), selection({
            operations: [{ operationId: 'painting_full', descuentoTipo: 'porcentaje', descuentoValor: 100 }],
        }), 1);
        expect(quote).toMatchObject({ subtotal: 84150, descuentoOperaciones: 84150, neto: 0, iva: 0, total: 0 });
    });
    it('redondea una sola vez al centavo y usa el IVA existente redondeado al peso', () => {
        const config = createDefaultDpConfiguration();
        config.tables.find((table) => table.id === 'painting').basePrice = 1.01;
        config.bodyTypes[0].sizes[0].factor = 0.5;
        config.rates.find((rate) => rate.bodyTypeId === 'hatchback' && rate.pieceId === 'parachoque' && rate.positionId === 'F').paintingFactor = 1;
        const quote = calculateDpWorkQuote(config, selection(), 1);
        expect(quote).toMatchObject({ neto: 0.51, iva: 0, total: 0.51 });
    });
    it('admite factores pequeños en notación científica sin errores de precisión', () => {
        const config = createDefaultDpConfiguration();
        config.bodyTypes[0].sizes[0].factor = 1e-7;
        config.tables.find((table) => table.id === 'painting').basePrice = 100000;
        const quote = calculateDpWorkQuote(config, selection({ positionId: 'R' }), 1);
        expect(quote.neto).toBe(0.01);
    });
});
describe('Configuración flexible y snapshot D&P', () => {
    it('calcula una pieza y operación nuevas sin modificar el código', () => {
        const config = createDefaultDpConfiguration();
        config.pieces.push({ id: 'aleta', label: 'Aleta', active: true });
        config.rates.push({ bodyTypeId: 'hatchback', pieceId: 'aleta', positionId: 'IZQ', positionLabel: 'Izquierda',
            paintingFactor: 0.6, repairFactor: 1.1, dismantlingFactor: 0.4, active: true });
        config.operations.push({ id: 'pintura_aleta', label: 'Pintura de aleta', tableId: 'painting', scope: 'piece',
            multiplier: 0.5, requiresDamage: false, active: true });
        const quote = calculateDpWorkQuote(config, selection({ pieceId: 'aleta', positionId: 'IZQ', operations: [{ operationId: 'pintura_aleta' }] }), 1);
        expect(quote).toMatchObject({ pieceLabel: 'Aleta', positionLabel: 'Izquierda', neto: 22950 });
    });
    it('cobra una tarifa fija global configurada sin multiplicarla por pieza ni tamaño', () => {
        const config = createDefaultDpConfiguration();
        config.tables.find((table) => table.id === 'global_painting_open').basePrice = 500000;
        const quote = calculateDpWorkQuote(config, selection({
            scope: 'global', bodyTypeId: 'suv', sizeId: 'XL', pieceId: undefined, positionId: undefined,
            operations: [{ operationId: 'global_painting_open' }],
        }), 1);
        expect(quote).toMatchObject({ pieceLabel: null, positionLabel: null, damageLabel: null, neto: 500000, iva: 95000, total: 595000 });
        expect(quote.lines[0]).toMatchObject({ vehicleFactor: 1, pieceFactor: 1, damageIncrement: 0 });
        expect(quote.stages).toHaveLength(5);
    });
    it('agrega un adicional con tarifa definida al trabajo seleccionado', () => {
        const config = createDefaultDpConfiguration();
        config.tables.find((table) => table.id === 'additional_alignment').basePrice = 5000;
        const quote = calculateDpWorkQuote(config, selection({ operations: [
                { operationId: 'painting_full' }, { operationId: 'additional_alignment' },
            ] }), 1);
        expect(quote.neto).toBe(89150);
        expect(quote.lines[1].subtotal).toBe(5000);
    });
    it('preserva por copia las cinco etapas, selección, precios y etiquetas utilizados', () => {
        const config = createDefaultDpConfiguration();
        const input = selection();
        config.stages[0].label = 'Desarme y evaluación';
        const originalConfig = structuredClone(config);
        const originalSelection = structuredClone(input);
        const quote = calculateDpWorkQuote(config, input, 1);
        expect(config).toEqual(originalConfig);
        expect(input).toEqual(originalSelection);
        config.stages[0].label = 'Otro título';
        config.stages[0].specialties.push('otro');
        config.tables[0].basePrice = 1;
        input.operations[0].operationId = 'dismantling';
        expect(quote.neto).toBe(84150);
        expect(quote.selection.operations[0].operationId).toBe('painting_full');
        expect(quote.stages).toHaveLength(5);
        expect(quote.stages[0]).toEqual({ key: 'armador_desarme', label: 'Desarme y evaluación', specialties: ['armador'] });
        quote.stages[1].specialties.push('snapshot');
        expect(config.stages[1].specialties).not.toContain('snapshot');
    });
    it('no prohíbe combinar reemplazo y reparación sin una regla de negocio definida', () => {
        const config = createDefaultDpConfiguration();
        config.tables.find((table) => table.id === 'replacement').basePrice = 30000;
        const quote = calculateDpWorkQuote(config, selection({ damageLevelId: 'D1', operations: [
                { operationId: 'repair_dent' }, { operationId: 'replacement_piece' },
            ] }), 1);
        expect(quote.neto).toBe(47000);
    });
});
describe('Validación de selección y tarifas D&P', () => {
    it('exporta una clase de error discriminable por la API', () => {
        const error = new DpPricingError('MISSING_TARIFF', 'Tarifa pendiente');
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('DpPricingError');
        expect(error.code).toBe('MISSING_TARIFF');
        expect(error.message).toBe('Tarifa pendiente');
    });
    it('rechaza revisiones obsoletas y revisiones inválidas', () => {
        expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection(), 2), 'STALE_CONFIGURATION');
        for (const revision of [0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
            expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection(), revision), 'INVALID_SELECTION');
            expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection({ configurationRevision: revision }), 1), 'INVALID_SELECTION');
        }
    });
    it.each([
        { bodyTypeId: 'otro' }, { sizeId: 'XL' }, { pieceId: 'maletero' }, { positionId: 'RR' },
        { pieceId: 'pilar', bodyTypeId: 'sedan', positionId: 'DL' },
        { operations: [{ operationId: 'inexistente' }] }, { pieceId: undefined }, { positionId: undefined },
        { scope: 'global' },
    ])('rechaza referencias o combinaciones de pieza inválidas: %j', (patch) => {
        expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection(patch), 1), 'INVALID_SELECTION');
    });
    it.each(['body', 'size', 'piece', 'rate', 'table', 'operation', 'damage'])('rechaza un elemento inactivo: %s', (target) => {
        const config = createDefaultDpConfiguration();
        const input = selection();
        if (target === 'body')
            config.bodyTypes[0].active = false;
        if (target === 'size')
            config.bodyTypes[0].sizes[0].active = false;
        if (target === 'piece')
            config.pieces.find((piece) => piece.id === 'parachoque').active = false;
        if (target === 'rate')
            config.rates.find((rate) => rate.bodyTypeId === 'hatchback' && rate.pieceId === 'parachoque' && rate.positionId === 'F').active = false;
        if (target === 'table')
            config.tables.find((table) => table.id === 'painting').active = false;
        if (target === 'operation')
            config.operations.find((operation) => operation.id === 'painting_full').active = false;
        if (target === 'damage') {
            config.damageLevels[0].active = false;
            input.damageLevelId = 'D1';
            input.operations = [{ operationId: 'repair_dent' }];
        }
        expectCode(() => calculateDpWorkQuote(config, input, 1), 'INVALID_SELECTION');
    });
    it('rechaza operaciones de otro alcance', () => {
        expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection({ operations: [{ operationId: 'global_painting_open' }] }), 1), 'INVALID_SELECTION');
        expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection({
            scope: 'global', pieceId: undefined, positionId: undefined,
        }), 1), 'INVALID_SELECTION');
    });
    it.each([
        ['painting_full', 'painting_retouch'], ['painting_retouch', 'painting_localized'],
        ['repair_dent', 'repair_plastic'], ['dismantling', 'dismantling'],
    ])('impide cobrar simultáneamente alternativas o duplicados: %s y %s', (first, second) => {
        expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection({
            damageLevelId: first.startsWith('repair') ? 'D1' : undefined,
            operations: [{ operationId: first }, { operationId: second }],
        }), 1), 'INVALID_SELECTION');
    });
    it('exige daño cuando corresponde y lo rechaza fuera de reparación o si no existe', () => {
        const config = createDefaultDpConfiguration();
        expectCode(() => calculateDpWorkQuote(config, selection({ operations: [{ operationId: 'repair_dent' }] }), 1), 'INVALID_SELECTION');
        expectCode(() => calculateDpWorkQuote(config, selection({ damageLevelId: 'D2' }), 1), 'INVALID_SELECTION');
        expectCode(() => calculateDpWorkQuote(config, selection({ damageLevelId: 'D9', operations: [{ operationId: 'repair_dent' }] }), 1), 'INVALID_SELECTION');
    });
    it.each(['painting_retouch', 'painting_localized', 'polishing_piece', 'replacement_piece',
        'additional_alignment', 'additional_support_repair', 'additional_special_paint', 'additional_extra_work',
    ])('informa tarifa pendiente en lugar de cobrar cero para %s', (operationId) => {
        expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection({ operations: [{ operationId }] }), 1), 'MISSING_TARIFF');
    });
    it.each(['global_painting_open', 'global_painting_closed', 'global_polishing'])('mantiene pendiente la tarifa global %s', (operationId) => {
        expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection({ scope: 'global', pieceId: undefined,
            positionId: undefined, operations: [{ operationId }] }), 1), 'MISSING_TARIFF');
    });
    it.each([
        { descuentoTipo: 'porcentaje', descuentoValor: 100.01 },
        { descuentoTipo: 'fijo', descuentoValor: 84150.01 },
        { descuentoTipo: null, descuentoValor: 1 },
        { descuentoValor: 1 }, { descuentoValor: -1 }, { descuentoValor: Number.NaN },
    ])('rechaza descuentos inválidos sin convertirlos en descuentos automáticos: %j', (discount) => {
        expectCode(() => calculateDpWorkQuote(createDefaultDpConfiguration(), selection({ operations: [
                { operationId: 'painting_full', ...discount },
            ] }), 1), 'INVALID_PRICE');
    });
    it('rechaza referencias rotas, identificadores repetidos y plantillas sin los cinco pasos', () => {
        const invalidConfigurations = [];
        const missingTable = createDefaultDpConfiguration();
        missingTable.operations[0].tableId = 'no_existe';
        invalidConfigurations.push(missingTable);
        const missingPiece = createDefaultDpConfiguration();
        missingPiece.rates[0].pieceId = 'no_existe';
        invalidConfigurations.push(missingPiece);
        const duplicated = createDefaultDpConfiguration();
        duplicated.pieces.push({ ...duplicated.pieces[0] });
        invalidConfigurations.push(duplicated);
        const fourStages = createDefaultDpConfiguration();
        fourStages.stages.pop();
        invalidConfigurations.push(fourStages);
        const repeatedStage = createDefaultDpConfiguration();
        repeatedStage.stages[4].key = repeatedStage.stages[0].key;
        invalidConfigurations.push(repeatedStage);
        for (const config of invalidConfigurations)
            expectCode(() => calculateDpWorkQuote(config, selection(), 1), 'INVALID_SELECTION');
    });
    it('rechaza importes no finitos, negativos o fuera del límite', () => {
        for (const basePrice of [Number.NaN, Infinity, -1, 10000000000]) {
            const config = createDefaultDpConfiguration();
            config.tables.find((table) => table.id === 'painting').basePrice = basePrice;
            expectCode(() => calculateDpWorkQuote(config, selection(), 1), 'INVALID_PRICE');
        }
        const config = createDefaultDpConfiguration();
        config.tables.find((table) => table.id === 'painting').basePrice = 9999999999.99;
        expectCode(() => calculateDpWorkQuote(config, selection({ sizeId: 'M' }), 1), 'INVALID_PRICE');
    });
    it('comprueba los límites también en la suma de conceptos y al agregar IVA', () => {
        const config = createDefaultDpConfiguration();
        config.tables.find((table) => table.id === 'painting').basePrice = 6000000000;
        config.tables.find((table) => table.id === 'dismantling').basePrice = 6000000000;
        expectCode(() => calculateDpWorkQuote(config, selection({ sizeId: 'M', positionId: 'R', operations: [
                { operationId: 'painting_full' }, { operationId: 'dismantling' },
            ] }), 1), 'INVALID_PRICE');
        config.tables.find((table) => table.id === 'painting').basePrice = 9000000000;
        expectCode(() => calculateDpWorkQuote(config, selection({ sizeId: 'M', positionId: 'R' }), 1), 'INVALID_PRICE');
    });
});
