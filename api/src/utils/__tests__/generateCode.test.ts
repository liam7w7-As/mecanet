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
    it('genera OT-YY-1 si no hay órdenes en ese año', async () => {
      const code = await generateWorkOrderCode(undefined, TEST_YEAR);
      expect(code).toBe('OT-99-1');
    });

    it('incrementa correlativamente el código tras crear un registro', async () => {
      const code1 = await generateWorkOrderCode(undefined, TEST_YEAR);
      await WorkOrder.create({ codigo: code1 });

      const code2 = await generateWorkOrderCode(undefined, TEST_YEAR);
      expect(code2).toBe('OT-99-2');

      await WorkOrder.create({ codigo: code2 });
      const code3 = await generateWorkOrderCode(undefined, TEST_YEAR);
      expect(code3).toBe('OT-99-3');
    });

    it('maneja transición a más de 4 dígitos (> 9999)', async () => {
      await WorkOrder.create({ codigo: `OT-${TEST_YEAR}-9999` });

      const nextCode = await generateWorkOrderCode(undefined, TEST_YEAR);
      expect(nextCode).toBe('OT-99-10000');
    });

    it('funciona dentro de una transacción con bloqueo', async () => {
      const t = await sequelize.transaction();
      try {
        const code = await generateWorkOrderCode(t, TEST_YEAR);
        expect(code).toMatch(/^OT-99-\d+$/);
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }
    });
  });

  describe('generateQuotationCode', () => {
    it('genera COT-YY-1 si no hay cotizaciones en ese año', async () => {
      const code = await generateQuotationCode(undefined, TEST_YEAR);
      expect(code).toBe('COT-99-1');
    });

    it('incrementa correlativamente el código tras crear cotizaciones', async () => {
      const code1 = await generateQuotationCode(undefined, TEST_YEAR);
      await Quotation.create({ codigo: code1 });

      const code2 = await generateQuotationCode(undefined, TEST_YEAR);
      expect(code2).toBe('COT-99-2');
    });
  });

  it('continúa el máximo de ambos formatos, incluso si fue eliminado, y reinicia en otro año', async () => {
    const old = await Quotation.create({ codigo: 'COT-2098-0005' });
    await old.destroy();
    expect(await generateQuotationCode(undefined, 2098)).toBe('COT-98-6');
    await Quotation.create({ codigo: 'COT-98-9' });
    expect(await generateQuotationCode(undefined, 2098)).toBe('COT-98-10');
    await Quotation.create({ codigo: 'COT-98-10' });
    expect(await generateQuotationCode(undefined, 2098)).toBe('COT-98-11');
    expect(await generateQuotationCode(undefined, 2097)).toBe('COT-97-1');
    await WorkOrder.create({ codigo: 'OT-2098-0005' });
    expect(await generateWorkOrderCode(undefined, 2098)).toBe('OT-98-6');
    expect(await generateWorkOrderCode(undefined, 2097)).toBe('OT-97-1');
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
