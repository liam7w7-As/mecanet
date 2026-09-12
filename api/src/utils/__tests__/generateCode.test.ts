import { Op } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { Quotation } from '../../models/Quotation.js';
import { WorkOrder } from '../../models/WorkOrder.js';
import { generateQuotationCode, generateWorkOrderCode, withCodeRetry } from '../generateCode.js';

describe('generateCode utility', () => {
  const TEST_YEAR = 2099;

  beforeAll(async () => {
    await sequelize.authenticate();
    // Limpiar posibles residuos del año de test
    await WorkOrder.destroy({
      where: { codigo: { [Op.like]: `OT-${TEST_YEAR}-%` } },
      force: true,
    });
    await Quotation.destroy({
      where: { codigo: { [Op.like]: `COT-${TEST_YEAR}-%` } },
      force: true,
    });
  });

  afterAll(async () => {
    await WorkOrder.destroy({
      where: { codigo: { [Op.like]: `OT-${TEST_YEAR}-%` } },
      force: true,
    });
    await Quotation.destroy({
      where: { codigo: { [Op.like]: `COT-${TEST_YEAR}-%` } },
      force: true,
    });
  });

  describe('generateWorkOrderCode', () => {
    it('genera OT-YYYY-0001 si no hay órdenes en ese año', async () => {
      const code = await generateWorkOrderCode(undefined, TEST_YEAR);
      expect(code).toBe(`OT-${TEST_YEAR}-0001`);
    });

    it('incrementa correlativamente el código tras crear un registro', async () => {
      const code1 = await generateWorkOrderCode(undefined, TEST_YEAR);
      await WorkOrder.create({ codigo: code1 });

      const code2 = await generateWorkOrderCode(undefined, TEST_YEAR);
      expect(code2).toBe(`OT-${TEST_YEAR}-0002`);

      await WorkOrder.create({ codigo: code2 });
      const code3 = await generateWorkOrderCode(undefined, TEST_YEAR);
      expect(code3).toBe(`OT-${TEST_YEAR}-0003`);
    });

    it('maneja transición a más de 4 dígitos (> 9999)', async () => {
      await WorkOrder.create({ codigo: `OT-${TEST_YEAR}-9999` });

      const nextCode = await generateWorkOrderCode(undefined, TEST_YEAR);
      expect(nextCode).toBe(`OT-${TEST_YEAR}-10000`);
    });

    it('funciona dentro de una transacción con bloqueo', async () => {
      const t = await sequelize.transaction();
      try {
        const code = await generateWorkOrderCode(t, TEST_YEAR);
        expect(code).toMatch(new RegExp(`^OT-${TEST_YEAR}-\\d{4,}$`));
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }
    });
  });

  describe('generateQuotationCode', () => {
    it('genera COT-YYYY-0001 si no hay cotizaciones en ese año', async () => {
      const code = await generateQuotationCode(undefined, TEST_YEAR);
      expect(code).toBe(`COT-${TEST_YEAR}-0001`);
    });

    it('incrementa correlativamente el código tras crear cotizaciones', async () => {
      const code1 = await generateQuotationCode(undefined, TEST_YEAR);
      await Quotation.create({ codigo: code1 });

      const code2 = await generateQuotationCode(undefined, TEST_YEAR);
      expect(code2).toBe(`COT-${TEST_YEAR}-0002`);
    });
  });

  describe('withCodeRetry', () => {
    it('reintenta y resuelve exitosamente cuando un intento previo falla', async () => {
      let attempts = 0;
      const result = await withCodeRetry(async (attempt) => {
        attempts = attempt;
        if (attempt === 1) {
          throw new Error('Collision error');
        }
        return 'success';
      }, 3);

      expect(attempts).toBe(2);
      expect(result).toBe('success');
    });

    it('lanza el último error si se superan los reintentos máximos', async () => {
      await expect(
        withCodeRetry(async () => {
          throw new Error('Persistent failure');
        }, 3),
      ).rejects.toThrow('Persistent failure');
    });
  });
});
