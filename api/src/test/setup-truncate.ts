import { beforeAll } from 'vitest';

import { sequelize } from '../config/database.js';
import { ensureFleetPermissions, ensurePurchasePermissions } from '../database/bootstrap.js';
import { up as ensureQuotationCommercial } from '../database/migrations/038-quotation-commercial-conditions.js';
import { up as ensureStartedWorkOrders } from '../database/migrations/039-start-work-orders-without-draft.js';
import { up as ensureFleetVehicles } from '../database/migrations/040-create-fleet-vehicles.js';
import { up as ensurePurchases } from '../database/migrations/041-create-purchases.js';
import { up as ensureWorkOrderLabor } from '../database/migrations/042-create-work-order-labor.js';
import { up as ensureQuotationWorkItemLinks } from '../database/migrations/043-link-quotation-work-items.js';
import { up as ensureCustomerEmails } from '../database/migrations/044-create-customer-emails.js';

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
  'customer_emails',
  'work_order_observation_files',
  'work_order_observations',
  'work_order_price_suggestions',
  'work_order_item_progress_events',
  'work_order_item_sessions',
  'purchase_items',
  'purchases',
  'suppliers',
  'fleet_document_versions',
  'fleet_documents',
  'fleet_vehicles',
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
  if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Las pruebas requieren unithor_test');
  await ensureQuotationCommercial(sequelize.getQueryInterface());
  await ensureStartedWorkOrders(sequelize.getQueryInterface());
  await ensureFleetVehicles(sequelize.getQueryInterface());
  await ensurePurchases(sequelize.getQueryInterface());
  await ensureWorkOrderLabor(sequelize.getQueryInterface());
  await ensureQuotationWorkItemLinks(sequelize.getQueryInterface());
  await ensureCustomerEmails(sequelize.getQueryInterface());
  await ensureFleetPermissions();
  await ensurePurchasePermissions();
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of TRANSIENT) {
      await sequelize.query(`TRUNCATE TABLE \`${table}\``);
    }
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
});
