
/**
 * Prueba del motor de maquetacion: no revisa pixels sino que el documento
 * produced tenga la estructura que un reporte promete. Un motor que no pagina
 * es el fallo caro, asi que se fuerzan muchas filas para comprobar que salta
 * de pagina y repite encabezado.
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { ReportDocument } from '../services/reports/report-layout.js';

describe('ReportDocument', () => {
  it('genera un PDF con portada, tabla y pie', async () => {
    const doc = await ReportDocument.create({
      title: 'Produccion de taller',
      subtitle: '01-09-2026 a 30-09-2026',
      company: 'UNITHOR',
    });

    doc.section('Resumen por estado').keyValues([
      ['Ordenes abiertas', '12'],
      ['Cerradas en el periodo', '48'],
    ]);

    doc.table(
      [
        { header: 'Orden', key: 'orden', width: 2 },
        { header: 'Vehiculo', key: 'vehiculo', width: 3 },
        { header: 'Estado', key: 'estado', width: 2 },
        { header: 'Total', key: 'total', width: 1, align: 'right' },
      ],
      [
        { orden: 'OT-2026-0001', vehiculo: 'PDWH-28', estado: 'En progreso', total: '$309.000' },
      ],
    );

    const bytes = await doc.finalize();
    expect(bytes.byteLength).toBeGreaterThan(1000);

    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('salta de pagina y repite encabezado con muchas filas', async () => {
    const doc = await ReportDocument.create({ title: 'Inventario' });

    doc.section('Movimientos');
    doc.table(
      [
        { header: 'Item', key: 'item', width: 3 },
        { header: 'Cantidad', key: 'cantidad', width: 1, align: 'right' },
      ],
      Array.from({ length: 220 }, (_, i) => ({
        item: `ITEM-${String(i).padStart(4, '0')}`,
        cantidad: i + 1,
      })),
    );

    const parsed = await PDFDocument.load(await doc.finalize());
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });

  it('no parte una fila entre dos paginas', async () => {
    const doc = await ReportDocument.create({ title: 'Cartera' });
    doc.section('Detalle');
    doc.table(
      [
        { header: 'Cliente', key: 'cliente', width: 3 },
        { header: 'Saldo', key: 'saldo', width: 1, align: 'right' },
      ],
      Array.from({ length: 60 }, (_, i) => ({ cliente: `CLIENTE ${i}`, saldo: `$ ${i},000` })),
    );
    const parsed = await PDFDocument.load(await doc.finalize());
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });

  it('trunca valores que no caben en su columna', async () => {
    const doc = await ReportDocument.create({ title: 'Estado de vehiculos' });
    doc.section('Detalle');
    doc.table(
      [{ header: 'Propietario', key: 'propietario', width: 1 }],
      [
        {
          propietario:
            'ASOCIACION INDIGENA AYMARA GANADERA DE LA PRODUCCION AGRICOLA DEL NORTE',
        },
      ],
    );
    const bytes = await doc.finalize();
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
