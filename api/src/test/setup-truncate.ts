import { beforeAll } from 'vitest';

import { sequelize } from '../config/database.js';
import {
  ensureFleetPermissions,
  ensureImportPermissions,
  ensurePurchasePermissions,
} from '../database/bootstrap.js';
import { up as ensureQuotationCommercial } from '../database/migrations/038-quotation-commercial-conditions.js';
import { up as ensureStartedWorkOrders } from '../database/migrations/039-start-work-orders-without-draft.js';
import { up as ensureFleetVehicles } from '../database/migrations/040-create-fleet-vehicles.js';
import { up as ensurePurchases } from '../database/migrations/041-create-purchases.js';
import { up as ensureWorkOrderLabor } from '../database/migrations/042-create-work-order-labor.js';
import { up as ensureQuotationWorkItemLinks } from '../database/migrations/043-link-quotation-work-items.js';
import { up as ensureCustomerEmails } from '../database/migrations/044-create-customer-emails.js';
import { up as ensureFleetRetirement } from '../database/migrations/045-fleet-retirement-and-private-owner.js';
import { up as ensureSalesAccessGrants } from '../database/migrations/046-create-sales-access-grants.js';
import { up as ensureNotificationAccessShared } from '../database/migrations/047-add-notification-access-shared.js';
import { up as ensureUserSalesAccessAll } from '../database/migrations/048-add-user-sales-access-all.js';
import { up as ensureVehiclePhotos } from '../database/migrations/049-add-vehicle-photo.js';
import { up as ensureWorkshopPersonnel } from '../database/migrations/050-workshop-personnel.js';
import { up as ensureWorkshopTime } from '../database/migrations/051-workshop-time-requests.js';
import { up as ensureWorkOrderTeams } from '../database/migrations/052-work-order-teams.js';
import { up as ensureWorkOrderQuality } from '../database/migrations/053-work-order-quality.js';
import { up as ensureWorkOrderCommercialControl } from '../database/migrations/054-work-order-commercial-control.js';
import { up as ensureWorkshopAlertSettings } from '../database/migrations/055-workshop-alert-settings.js';
import { up as ensureWorkshopWorkingHours } from '../database/migrations/056-workshop-working-hours.js';
import { up as ensureWorkshopOvertime } from '../database/migrations/057-workshop-overtime.js';
import { up as ensureWorkshopTimeOperational } from '../database/migrations/058-workshop-time-operational.js';
import { up as ensureWorkshopCommercialReviews } from '../database/migrations/059-workshop-commercial-reviews.js';
import { up as ensureWorkshopDailyEntries } from '../database/migrations/060-workshop-daily-entries.js';
import { up as ensureWorkshopDeclaredHours } from '../database/migrations/061-workshop-declared-hours.js';
import { up as ensureCatalogDivisionsAndDpWorkflow } from '../database/migrations/062-catalog-divisions-and-dp-workflow.js';
import { up as ensureDpTimeStage } from '../database/migrations/063-dp-time-stage.js';
import { up as ensureDpConfiguration } from '../database/migrations/064-dp-configuration.js';
import { up as ensureDpWorkSnapshots } from '../database/migrations/065-dp-work-snapshots.js';

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
  'work_order_dp_stages',
  'workshop_commercial_reviews',
  'workshop_alert_settings',
  'work_order_quality_reviews',
  'work_order_item_assignments',
  'workshop_time_requests',
  'workshop_schedule_exceptions',
  'workshop_schedules',
  'worker_specialties',
  'specialty_rates',
  'specialties',
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
  'sales_access_grants',
  'refresh_tokens',
];

beforeAll(async () => {
  if (sequelize.getDatabaseName() !== 'unithor_test') throw new Error('Las pruebas requieren unithor_test');
  await ensureQuotationCommercial(sequelize.getQueryInterface());
  await ensureStartedWorkOrders(sequelize.getQueryInterface());
  await ensureFleetVehicles(sequelize.getQueryInterface());
  await ensureVehiclePhotos(sequelize.getQueryInterface());
  await ensureFleetRetirement(sequelize.getQueryInterface());
  await ensurePurchases(sequelize.getQueryInterface());
  await ensureWorkOrderLabor(sequelize.getQueryInterface());
  await ensureQuotationWorkItemLinks(sequelize.getQueryInterface());
  await ensureCustomerEmails(sequelize.getQueryInterface());
  await ensureSalesAccessGrants(sequelize.getQueryInterface());
  await ensureNotificationAccessShared(sequelize.getQueryInterface());
  await ensureUserSalesAccessAll(sequelize.getQueryInterface());
  await ensureWorkshopPersonnel(sequelize.getQueryInterface());
  await ensureWorkshopTime(sequelize.getQueryInterface());
  await ensureWorkOrderTeams(sequelize.getQueryInterface());
  await ensureWorkOrderQuality(sequelize.getQueryInterface());
  await ensureWorkOrderCommercialControl(sequelize.getQueryInterface());
  await ensureWorkshopAlertSettings(sequelize.getQueryInterface());
  await ensureWorkshopWorkingHours(sequelize.getQueryInterface());
  await ensureWorkshopOvertime(sequelize.getQueryInterface());
  await ensureWorkshopTimeOperational(sequelize.getQueryInterface());
  await ensureWorkshopCommercialReviews(sequelize.getQueryInterface());
  await ensureWorkshopDailyEntries(sequelize.getQueryInterface());
  await ensureWorkshopDeclaredHours(sequelize.getQueryInterface());
  await ensureCatalogDivisionsAndDpWorkflow(sequelize.getQueryInterface());
  await ensureDpTimeStage(sequelize.getQueryInterface());
  await ensureDpConfiguration(sequelize.getQueryInterface());
  await ensureDpWorkSnapshots(sequelize.getQueryInterface());
  await ensureFleetPermissions();
  await ensurePurchasePermissions();
  await ensureImportPermissions();
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const table of TRANSIENT) {
      await sequelize.query(`TRUNCATE TABLE \`${table}\``);
    }
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
});
