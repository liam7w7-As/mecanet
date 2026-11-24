import { describe, expect, it } from 'vitest';
import { dpConfigurationSchema } from '../../schemas/dp-configuration.schema.js';
import { DP_STAGE_KEYS, DP_STAGE_SPECIALTIES } from '../catalog-types.js';
import { createDefaultDpConfiguration } from '../dp-configuration.js';
describe('Configuración D&P inicial', () => {
    it('cumple el contrato y usa bases netas, separadas de las tarifas pendientes', () => {
        const config = createDefaultDpConfiguration();
        expect(dpConfigurationSchema.safeParse(config).success).toBe(true);
        expect(config.tables.filter((table) => table.basePrice !== null)).toEqual([
            { id: 'painting', label: 'Pintura por pieza', formula: 'painting', basePrice: 90000, active: true },
            { id: 'repair', label: 'Reparación por pieza', formula: 'repair', basePrice: 20000, active: true },
            { id: 'dismantling', label: 'Desmontaje y montaje', formula: 'dismantling', basePrice: 20000, active: true },
        ]);
        expect(config.damageLevels.map(({ id, increment }) => [id, increment])).toEqual([
            ['D1', 0], ['D2', 0.5], ['D3', 1],
        ]);
    });
    it('preserva las cuatro carrocerías y todos sus factores por tamaño', () => {
        expect(createDefaultDpConfiguration().bodyTypes.map((body) => ({
            id: body.id, sizes: body.sizes.map(({ id, factor }) => [id, factor]),
        }))).toEqual([
            { id: 'hatchback', sizes: [['S', 0.85], ['M', 1]] },
            { id: 'sedan', sizes: [['S', 0.95], ['M', 1]] },
            { id: 'suv', sizes: [['M', 1.05], ['L', 1.15], ['XL', 1.3]] },
            { id: 'pickup', sizes: [['M', 1], ['L', 1.15], ['XL', 1.3]] },
        ]);
    });
    it.each([
        ['hatchback', {
                parachoque: [1, 1.1], capo: [1.3], guardafango: [0.75], puerta: [1], techo: [1.45],
                marco_superior: [0.35], pilar: [0.25], retrovisor: [0.2], moldura_guardafango: [0.3],
                panel_lateral: [0.9], porton: [1.2],
            }],
        ['sedan', {
                parachoque: [1.1], capo: [1.7], guardafango: [0.8], puerta: [1], techo: [1.8],
                marco_superior: [0.4], pilar: [0.25], retrovisor: [0.2], moldura_guardafango: [0.3],
                panel_lateral: [1.2], maletero: [0.95],
            }],
        ['suv', {
                parachoque: [1.2], capo: [1.5], guardafango: [0.85], puerta: [1], techo: [2.1],
                marco_superior: [0.45], pilar: [0.3], retrovisor: [0.2], moldura_guardafango: [0.35],
                panel_lateral: [1.35], porton: [1.5],
            }],
        ['pickup', {
                parachoque: [0.85, 1.2], capo: [1.6], guardafango: [0.9], puerta: [1], techo: [1.7],
                marco_superior: [0.45], pilar: [0.3], retrovisor: [0.2], moldura_guardafango: [0.35],
                lateral_pickup: [1.8], portalon: [1.35],
            }],
    ])('transcribe los factores de pintura de %s y los copia inicialmente a desmontaje', (bodyTypeId, expected) => {
        const rates = createDefaultDpConfiguration().rates.filter((rate) => rate.bodyTypeId === bodyTypeId);
        const factors = {};
        for (const rate of rates) {
            factors[rate.pieceId] = [...new Set([...(factors[rate.pieceId] ?? []), rate.paintingFactor])].sort((a, b) => a - b);
            expect(rate.dismantlingFactor).toBe(rate.paintingFactor);
            expect(rate.repairFactor).toBe(1);
        }
        expect(factors).toEqual(expected);
    });
    it('distingue factores delantero/trasero de hatchback y pickup', () => {
        const rates = createDefaultDpConfiguration().rates;
        for (const [bodyTypeId, front, rear] of [['hatchback', 1.1, 1], ['pickup', 1.2, 0.85]]) {
            expect(rates.find((rate) => rate.bodyTypeId === bodyTypeId && rate.pieceId === 'parachoque' && rate.positionId === 'F')?.paintingFactor).toBe(front);
            expect(rates.find((rate) => rate.bodyTypeId === bodyTypeId && rate.pieceId === 'parachoque' && rate.positionId === 'R')?.paintingFactor).toBe(rear);
        }
    });
    it('ofrece solo piezas y posiciones válidas por carrocería sin inventar el significado de A/B/C/D', () => {
        const rates = createDefaultDpConfiguration().rates;
        const positions = (body, piece) => rates
            .filter((rate) => rate.bodyTypeId === body && rate.pieceId === piece)
            .map((rate) => rate.positionId).sort();
        expect(positions('hatchback', 'puerta')).toEqual(['FL', 'FR', 'RL', 'RR']);
        expect(positions('hatchback', 'pilar')).toEqual(['AL', 'AR', 'BL', 'BR', 'CL', 'CR', 'DL', 'DR']);
        expect(positions('suv', 'pilar')).toEqual(['AL', 'AR', 'BL', 'BR', 'CL', 'CR', 'DL', 'DR']);
        expect(positions('sedan', 'pilar')).toEqual(['AL', 'AR', 'BL', 'BR', 'CL', 'CR']);
        expect(positions('pickup', 'pilar')).toEqual(['AL', 'AR', 'BL', 'BR', 'CL', 'CR']);
        expect(positions('sedan', 'porton')).toEqual([]);
        expect(positions('hatchback', 'maletero')).toEqual([]);
        expect(positions('suv', 'lateral_pickup')).toEqual([]);
        expect(positions('pickup', 'portalon')).toEqual(['UNICA']);
        expect(rates.filter((rate) => rate.pieceId === 'moldura_guardafango').every((rate) => rate.positionLabel === rate.positionId && ['A', 'B', 'C', 'D'].includes(rate.positionId))).toBe(true);
        expect(rates.find((rate) => rate.pieceId === 'parachoque' && rate.positionId === 'R')?.positionLabel).toBe('Trasero');
        expect(rates.find((rate) => rate.pieceId === 'guardafango' && rate.positionId === 'R')?.positionLabel).toBe('Derecha');
    });
    it('no inventa precios de pulido, reemplazo, retoque, pintura localizada, adicionales ni globales', () => {
        const config = createDefaultDpConfiguration();
        for (const id of ['polishing', 'replacement'])
            expect(config.tables.find((table) => table.id === id)?.basePrice).toBeNull();
        for (const id of ['painting_retouch', 'painting_localized'])
            expect(config.operations.find((operation) => operation.id === id)?.multiplier).toBeNull();
        const pending = config.operations.filter((operation) => operation.scope !== 'piece');
        // Desmontaje/montaje is a single known operation, not a second pending extra.
        expect(pending.filter((operation) => operation.scope === 'additional')).toHaveLength(4);
        expect(pending.filter((operation) => operation.scope === 'global')).toHaveLength(3);
        for (const operation of pending)
            expect(config.tables.find((table) => table.id === operation.tableId)).toMatchObject({ formula: 'fixed', basePrice: null });
        expect(config.operations.filter((operation) => /desmontaje/i.test(operation.label))).toHaveLength(1);
    });
    it('conserva los cinco pasos y las especialidades y devuelve copias editables independientes', () => {
        const first = createDefaultDpConfiguration();
        const other = createDefaultDpConfiguration();
        expect(first.stages.map((stage) => stage.key)).toEqual([...DP_STAGE_KEYS]);
        for (const stage of first.stages)
            expect(stage.specialties).toEqual(DP_STAGE_SPECIALTIES[stage.key]);
        first.stages[0].specialties.push('nueva');
        first.bodyTypes[0].sizes[0].factor = 2;
        first.rates[0].paintingFactor = 3;
        first.tables[0].basePrice = 1;
        expect(other).toEqual(createDefaultDpConfiguration());
        expect(DP_STAGE_SPECIALTIES.armador_desarme).toEqual(['armador']);
    });
    it('permite agregar piezas, posiciones, tamaños, tarifas y etiquetas mediante configuración', () => {
        const config = createDefaultDpConfiguration();
        config.pieces.push({ id: 'aleta', label: 'Aleta', active: true });
        config.bodyTypes[0].sizes.push({ id: 'XS', label: 'Extra pequeño', factor: 0.7, active: true });
        config.rates.push({ bodyTypeId: 'hatchback', pieceId: 'aleta', positionId: 'IZQ', positionLabel: 'Izquierda',
            paintingFactor: 0.6, repairFactor: 1.2, dismantlingFactor: 0.4, active: true });
        config.stages[1].label = 'Preparación y desabolladura';
        expect(dpConfigurationSchema.safeParse(config).success).toBe(true);
    });
});
