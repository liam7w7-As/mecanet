import { beforeAll } from 'vitest';
import { sequelize } from '../config/database.js';

/**
 * Vacia las tablas transaccionales antes de cada archivo de test.
 *
 * La suite ya corre en serie (`vitest run --no-file-parallelism`), asi que esto
 * no pisa el trabajo de otro archivo: solo evita que un test vea las filas que
 * dejo el anterior. Ese era el fallo de commercial-report, que asumia que su
 * cotizacion era la primera fila del informe y en realidad encontraba una
 * COT-2026-0001 sembrada por otro archivo.
 *
 * La linea base NO se toca, y eso es lo que hace seguro a este archivo:
 * users, roles, permissions, role_permissions y company_settings (001-004);
 * catalog_items, clients y vehicles (005-006); warehouses (007); y
 * stock_balances, que se deriva de esas. Un truncate que las vaciaba dejaba la
 * suite en rojo sin cambiar una linea de codigo.
 */
const TRANSIENT = [
  'work_order_inspection_photos',
  'work_order_inspections',
  'work_order_events',
  'work_order_items',
  'work_order_requests',
  'work_order_progress_reports',
  'work_order_deliveries',
  'work_orders',
  'quotation_items',
  'quotations',
  'payments',
  'stock_movements',
  'cash_movements',
  'daily_cash_closures',
  'notifications',
  'refresh_tokens',
];

beforeAll(async () => {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of TRANSIENT) {
      await sequelize.query(`TRUNCATE TABLE \`${table}\``);
    }
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
});
