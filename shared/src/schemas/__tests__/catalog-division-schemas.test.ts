import { describe, expect, it } from 'vitest';

import { DP_STAGE_KEYS, DP_STAGE_SPECIALTIES, resolveCatalogClassification } from '../../constants/catalog-types.js';
import {
  createCatalogItemSchema,
  updateCatalogItemSchema,
} from '../catalog-item.schema.js';
import {
  quotationItemInputSchema,
} from '../quotation.schema.js';
import {
  updateAccArmadorReceptionSchema,
  updateAccBodegueroDeliverySchema,
} from '../work-order-acc-custody.schema.js';
import {
  assignDpStageSchema,
  reviewDpQualitySchema,
  updateDpStageStatusSchema,
} from '../work-order-dp-stage.schema.js';
import {
  workOrderItemInputSchema,
} from '../work-order.schema.js';

describe('Catalog division, DP stages and ACC custody schemas (Phase 2)', () => {
  describe('createCatalogItemSchema', () => {
    it('resolves D&P division into standard type and service_dp subtype with zero stock', () => {
      const parsed = createCatalogItemSchema.parse({
        division: 'DP',
        nombre: 'Parachoque Delantero - Pintura',
        precio: 90000,
        horasHombreEstandar: 3.5,
        stock: 10, // Stock should be ignored for DP services
      });

      expect(parsed.division).toBe('DP');
      expect(parsed.subtipo).toBe('servicio_dp');
      expect(parsed.tipo).toBe('estandar');
      expect(parsed.stock).toBe(0);
      expect(parsed.horasHombreEstandar).toBe(3.5);
    });

    it('resolves ACC in-stock item keeping stock', () => {
      const parsed = createCatalogItemSchema.parse({
        division: 'ACC',
        subtipo: 'en_stock',
        nombre: 'Filtro de Aceite',
        precio: 15000,
        stock: 25,
      });

      expect(parsed.division).toBe('ACC');
      expect(parsed.subtipo).toBe('en_stock');
      expect(parsed.tipo).toBe('parte');
      expect(parsed.stock).toBe(25);
    });

    it('resolves ACC a_pedido item with zero stock', () => {
      const parsed = createCatalogItemSchema.parse({
        division: 'ACC',
        subtipo: 'a_pedido',
        nombre: 'Snorkel Hilux Especial',
        precio: 120000,
        stock: 5, // A pedido cannot have initial physical stock
      });

      expect(parsed.division).toBe('ACC');
      expect(parsed.subtipo).toBe('a_pedido');
      expect(parsed.tipo).toBe('parte');
      expect(parsed.stock).toBe(0);
    });

    it('preserves the explicitly supplied MEC diagnostic price', () => {
      const parsed = createCatalogItemSchema.parse({
        division: 'MEC',
        subtipo: 'especifico',
        nombre: 'Diagnóstico de Fuga de Aceite',
        precio: 1,
      });

      expect(parsed.division).toBe('MEC');
      expect(parsed.subtipo).toBe('especifico');
      expect(parsed.tipo).toBe('especifico');
      expect(parsed.precio).toBe(1);
      expect(parsed.stock).toBe(0);
    });

    it('preserves 100% backward compatibility when legacy tipo is supplied', () => {
      const legacyPart = createCatalogItemSchema.parse({
        tipo: 'parte',
        nombre: 'Bujía Iridio',
        precio: 12000,
        stock: 8,
      });
      expect(legacyPart.division).toBe('ACC');
      expect(legacyPart.subtipo).toBe('en_stock');
      expect(legacyPart.tipo).toBe('parte');
      expect(legacyPart.stock).toBe(8);

      const legacyService = createCatalogItemSchema.parse({
        tipo: 'estandar',
        nombre: 'Alineación',
        precio: 25000,
      });
      expect(legacyService.division).toBe('MEC');
      expect(legacyService.subtipo).toBe('estandar');
      expect(legacyService.tipo).toBe('estandar');
    });
  });

  describe('updateCatalogItemSchema', () => {
    it('preserves partial fields until the service merges the current locked item', () => {
      const updated = updateCatalogItemSchema.parse({
        division: 'ACC',
        subtipo: 'a_pedido',
      });
      expect(updated.division).toBe('ACC');
      expect(updated.subtipo).toBe('a_pedido');
      expect(updated.tipo).toBeUndefined();
    });

    it('does not invent division, type, stock or prices for a subtype-only PATCH', () => {
      const patch = updateCatalogItemSchema.parse({ subtipo: 'a_pedido' });
      expect(patch).toEqual({ subtipo: 'a_pedido' });
      expect(resolveCatalogClassification(patch, {
        tipo: 'parte', division: 'ACC', subtipo: 'en_stock',
      })).toEqual({ tipo: 'parte', division: 'ACC', subtipo: 'a_pedido' });
    });

    it('keeps DP when a legacy PATCH sends the unchanged standard type', () => {
      expect(resolveCatalogClassification({ tipo: 'estandar' }, {
        tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp',
      })).toEqual({ tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp' });
    });

    it('resolves explicit division and legacy type changes with appropriate defaults', () => {
      expect(resolveCatalogClassification({ division: 'DP' }, {
        tipo: 'parte', division: 'ACC', subtipo: 'a_pedido',
      })).toEqual({ tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp' });
      expect(resolveCatalogClassification({ tipo: 'especifico' }, {
        tipo: 'parte', division: 'ACC', subtipo: 'a_pedido',
      })).toEqual({ tipo: 'especifico', division: 'MEC', subtipo: 'especifico' });
    });

    it('rejects contradictory classification, unknown fields and empty patches', () => {
      expect(updateCatalogItemSchema.safeParse({ division: 'DP', subtipo: 'en_stock' }).success).toBe(false);
      expect(createCatalogItemSchema.safeParse({ nombre: 'Filtro', division: 'ACC', tipo: 'especifico' }).success).toBe(false);
      expect(updateCatalogItemSchema.safeParse({ precio: 0, otro: 1 }).success).toBe(false);
      expect(updateCatalogItemSchema.safeParse({}).success).toBe(false);
    });

    it('keeps zero-priced diagnostics pending valuation and resolves subtype-only creates', () => {
      expect(createCatalogItemSchema.parse({ nombre: 'Diagnóstico', subtipo: 'especifico', precio: 0 }))
        .toMatchObject({ tipo: 'especifico', division: 'MEC', subtipo: 'especifico', precio: 0 });
      expect(createCatalogItemSchema.parse({ nombre: 'Puerta', subtipo: 'servicio_dp', tipo: 'estandar' }))
        .toMatchObject({ tipo: 'estandar', division: 'DP', subtipo: 'servicio_dp' });
    });
  });

  describe('stage specialties', () => {
    it('defines allowed worker specialties for each canonical stage without adding auth roles', () => {
      expect(Object.keys(DP_STAGE_SPECIALTIES)).toEqual([...DP_STAGE_KEYS]);
      expect(DP_STAGE_SPECIALTIES.armador_desarme).toContain('armador');
      expect(DP_STAGE_SPECIALTIES.armador_montaje).toContain('armador');
      expect(DP_STAGE_SPECIALTIES.pintor).toEqual(['pintor']);
    });
  });

  describe('D&P workflow schemas', () => {
    it('assignDpStageSchema validates user assignment or unassignment', () => {
      expect(assignDpStageSchema.parse({ assignedUserId: 5 }).assignedUserId).toBe(5);
      expect(assignDpStageSchema.parse({ assignedUserId: null }).assignedUserId).toBeNull();
      expect(assignDpStageSchema.safeParse({ assignedUserId: -1 }).success).toBe(false);
    });

    it('updateDpStageStatusSchema validates sequential stage status and notes', () => {
      const valid = updateDpStageStatusSchema.parse({
        status: 'completado',
        note: 'Se sustituyeron 3 clips de puerta dañados',
      });
      expect(valid.status).toBe('completado');
      expect(valid.note).toContain('clips de puerta');

      expect(updateDpStageStatusSchema.safeParse({ status: 'invalid_status' }).success).toBe(false);
    });

    it('reviewDpQualitySchema validates final quality check CCF', () => {
      expect(reviewDpQualitySchema.parse({ status: 'aprobado', note: 'Pintura y armado impecable' }).status).toBe('aprobado');
      expect(reviewDpQualitySchema.parse({ status: 'rechazado', note: 'Pulir mota en borde superior' }).status).toBe('rechazado');
      expect(reviewDpQualitySchema.safeParse({ status: 'otro' }).success).toBe(false);
    });
  });

  describe('ACC custody schemas', () => {
    it('validates bodeguero delivery update', () => {
      const delivery = updateAccBodegueroDeliverySchema.parse({
        bodegueroUserId: 3,
        entregado: true,
      });
      expect(delivery.bodegueroUserId).toBe(3);
      expect(delivery.entregado).toBe(true);
    });

    it('validates armador reception update with note', () => {
      const reception = updateAccArmadorReceptionSchema.parse({
        armadorUserId: 7,
        recibido: true,
        notaEntrega: 'Recibido en mesón de carrocería en caja original',
      });
      expect(reception.armadorUserId).toBe(7);
      expect(reception.recibido).toBe(true);
      expect(reception.notaEntrega).toContain('Recibido');
    });
  });

  describe('WorkOrderItem and QuotationItem input schemas', () => {
    it('workOrderItemInputSchema accepts division, subtipo and esAPedido', () => {
      const parsed = workOrderItemInputSchema.parse({
        descripcion: 'Parachoque Delantero L',
        division: 'DP',
        subtipo: 'servicio_dp',
        precioUnitario: 90000,
        horasHombreEstimadas: 3.0,
      });
      expect(parsed.division).toBe('DP');
      expect(parsed.subtipo).toBe('servicio_dp');
      expect(parsed.horasHombreEstimadas).toBe(3.0);

      const parsedAcc = workOrderItemInputSchema.parse({
        descripcion: 'Snorkel Safari Especial',
        division: 'ACC',
        subtipo: 'a_pedido',
        esAPedido: true,
        precioUnitario: 140000,
      });
      expect(parsedAcc.division).toBe('ACC');
      expect(parsedAcc.esAPedido).toBe(true);
    });

    it('quotationItemInputSchema accepts division and subtipo', () => {
      const parsed = quotationItemInputSchema.parse({
        descripcion: 'Puerta trasera derecha',
        division: 'DP',
        subtipo: 'servicio_dp',
        precioUnitario: 85000,
      });
      expect(parsed.division).toBe('DP');
      expect(parsed.subtipo).toBe('servicio_dp');
    });
  });
});
