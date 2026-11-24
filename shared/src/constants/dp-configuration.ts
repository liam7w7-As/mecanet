import { DP_STAGE_KEYS, DP_STAGE_LABELS, DP_STAGE_SPECIALTIES } from './catalog-types.js';

import type { DpConfiguration } from '../schemas/dp-configuration.schema.js';

type BodyType = DpConfiguration['bodyTypes'][number];
type Rate = DpConfiguration['rates'][number];
type PieceFactors = readonly [pieceId: string, factor: number, frontFactor?: number];
type Position = readonly [id: string, label: string];

const SIDES: readonly Position[] = [['L', 'Izquierda'], ['R', 'Derecha']];
const UNIQUE_POSITION: readonly Position[] = [['UNICA', 'Única']];

function positionsFor(pieceId: string, bodyTypeId: string): readonly Position[] {
  switch (pieceId) {
    case 'parachoque': return [['F', 'Delantero'], ['R', 'Trasero']];
    case 'puerta': return [
      ['FL', 'Delantera izquierda'], ['FR', 'Delantera derecha'],
      ['RL', 'Trasera izquierda'], ['RR', 'Trasera derecha'],
    ];
    case 'pilar': {
      const letters = bodyTypeId === 'hatchback' || bodyTypeId === 'suv'
        ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C'];
      return letters.flatMap((letter): Position[] => [
        [`${letter}L`, `${letter} izquierdo`], [`${letter}R`, `${letter} derecho`],
      ]);
    }
    // These codes have not been given physical names; do not guess their meaning.
    case 'moldura_guardafango': return [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']];
    case 'guardafango':
    case 'marco_superior':
    case 'retrovisor':
    case 'panel_lateral':
    case 'lateral_pickup': return SIDES;
    default: return UNIQUE_POSITION;
  }
}

function createRates(): Rate[] {
  const factorsByBody: Record<string, readonly PieceFactors[]> = {
    hatchback: [
      ['parachoque', 1, 1.1], ['capo', 1.3], ['guardafango', 0.75], ['puerta', 1],
      ['techo', 1.45], ['marco_superior', 0.35], ['pilar', 0.25], ['retrovisor', 0.2],
      ['moldura_guardafango', 0.3], ['panel_lateral', 0.9], ['porton', 1.2],
    ],
    sedan: [
      ['parachoque', 1.1], ['capo', 1.7], ['guardafango', 0.8], ['puerta', 1],
      ['techo', 1.8], ['marco_superior', 0.4], ['pilar', 0.25], ['retrovisor', 0.2],
      ['moldura_guardafango', 0.3], ['panel_lateral', 1.2], ['maletero', 0.95],
    ],
    suv: [
      ['parachoque', 1.2], ['capo', 1.5], ['guardafango', 0.85], ['puerta', 1],
      ['techo', 2.1], ['marco_superior', 0.45], ['pilar', 0.3], ['retrovisor', 0.2],
      ['moldura_guardafango', 0.35], ['panel_lateral', 1.35], ['porton', 1.5],
    ],
    pickup: [
      ['parachoque', 0.85, 1.2], ['capo', 1.6], ['guardafango', 0.9], ['puerta', 1],
      ['techo', 1.7], ['marco_superior', 0.45], ['pilar', 0.3], ['retrovisor', 0.2],
      ['moldura_guardafango', 0.35], ['lateral_pickup', 1.8], ['portalon', 1.35],
    ],
  };
  return Object.entries(factorsByBody).flatMap(([bodyTypeId, pieces]) =>
    pieces.flatMap(([pieceId, factor, frontFactor]) =>
      positionsFor(pieceId, bodyTypeId).map(([positionId, positionLabel]) => {
        const pieceFactor = positionId === 'F' ? frontFactor ?? factor : factor;
        return {
          bodyTypeId, pieceId, positionId, positionLabel,
          paintingFactor: pieceFactor, repairFactor: 1, dismantlingFactor: pieceFactor, active: true,
        };
      })));
}

function body(id: string, label: string, sizes: readonly (readonly [string, number])[]): BodyType {
  return {
    id, label, active: true,
    sizes: sizes.map(([sizeId, factor]) => ({ id: sizeId, label: sizeId, factor, active: true })),
  };
}

/** Fresh, editable net tariffs. Unknown prices remain null, never a free service. */
export function createDefaultDpConfiguration(): DpConfiguration {
  const pendingServices = [
    { id: 'additional_alignment', label: 'Ajuste y alineación', scope: 'additional' },
    { id: 'additional_support_repair', label: 'Reparación de soportes', scope: 'additional' },
    { id: 'additional_special_paint', label: 'Acabado especial de pintura', scope: 'additional' },
    { id: 'additional_extra_work', label: 'Trabajo extraordinario', scope: 'additional' },
    { id: 'global_painting_open', label: 'Pintura completa con puertas abiertas', scope: 'global' },
    { id: 'global_painting_closed', label: 'Pintura completa con puertas cerradas', scope: 'global' },
    { id: 'global_polishing', label: 'Pulido completo', scope: 'global' },
  ] as const;

  return {
    bodyTypes: [
      body('hatchback', 'Hatchback', [['S', 0.85], ['M', 1]]),
      body('sedan', 'Sedán', [['S', 0.95], ['M', 1]]),
      body('suv', 'SUV', [['M', 1.05], ['L', 1.15], ['XL', 1.3]]),
      body('pickup', 'Pickup', [['M', 1], ['L', 1.15], ['XL', 1.3]]),
    ],
    pieces: [
      ['parachoque', 'Parachoque'], ['capo', 'Capó'], ['guardafango', 'Guardafango'],
      ['puerta', 'Puerta'], ['techo', 'Techo'], ['marco_superior', 'Marco superior'],
      ['pilar', 'Pilar'], ['retrovisor', 'Retrovisor'], ['moldura_guardafango', 'Moldura de guardafango'],
      ['panel_lateral', 'Panel lateral'], ['porton', 'Portón'], ['maletero', 'Maletero'],
      ['lateral_pickup', 'Lateral de pickup'], ['portalon', 'Portalón'],
    ].map(([id, label]) => ({ id, label, active: true })),
    rates: createRates(),
    tables: [
      { id: 'painting', label: 'Pintura por pieza', formula: 'painting', basePrice: 90000, active: true },
      { id: 'repair', label: 'Reparación por pieza', formula: 'repair', basePrice: 20000, active: true },
      { id: 'dismantling', label: 'Desmontaje y montaje', formula: 'dismantling', basePrice: 20000, active: true },
      { id: 'polishing', label: 'Pulido por pieza', formula: 'fixed', basePrice: null, active: true },
      { id: 'replacement', label: 'Reemplazo de pieza', formula: 'fixed', basePrice: null, active: true },
      ...pendingServices.map(({ id, label }) => ({ id, label, formula: 'fixed' as const, basePrice: null, active: true })),
    ],
    operations: [
      { id: 'painting_full', label: 'Pintura completa de la pieza', scope: 'piece', tableId: 'painting', multiplier: 1, requiresDamage: false, active: true },
      { id: 'painting_retouch', label: 'Retoque de pintura', scope: 'piece', tableId: 'painting', multiplier: null, requiresDamage: false, active: true },
      { id: 'painting_localized', label: 'Pintura localizada', scope: 'piece', tableId: 'painting', multiplier: null, requiresDamage: false, active: true },
      { id: 'repair_dent', label: 'Desabolladura', scope: 'piece', tableId: 'repair', multiplier: 1, requiresDamage: true, active: true },
      { id: 'repair_plastic', label: 'Reparación de plásticos y parachoques', scope: 'piece', tableId: 'repair', multiplier: 1, requiresDamage: true, active: true },
      { id: 'dismantling', label: 'Desmontaje y montaje', scope: 'piece', tableId: 'dismantling', multiplier: 1, requiresDamage: false, active: true },
      { id: 'polishing_piece', label: 'Pulido por pieza', scope: 'piece', tableId: 'polishing', multiplier: 1, requiresDamage: false, active: true },
      { id: 'replacement_piece', label: 'Reemplazo de pieza', scope: 'piece', tableId: 'replacement', multiplier: 1, requiresDamage: false, active: true },
      ...pendingServices.map(({ id, label, scope }) => ({
        id, label, scope, tableId: id, multiplier: 1, requiresDamage: false, active: true,
      })),
    ],
    damageLevels: [
      { id: 'D1', label: 'D1', increment: 0, active: true },
      { id: 'D2', label: 'D2', increment: 0.5, active: true },
      { id: 'D3', label: 'D3', increment: 1, active: true },
    ],
    stages: DP_STAGE_KEYS.map((key) => ({
      key, label: DP_STAGE_LABELS[key], specialties: [...DP_STAGE_SPECIALTIES[key]],
    })),
  };
}
