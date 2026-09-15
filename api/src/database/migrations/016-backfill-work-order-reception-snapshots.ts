import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `UPDATE work_orders AS work_order
     INNER JOIN clients AS client ON client.id = work_order.client_id
     SET work_order.contact_client_id = client.id,
         work_order.contact_name = client.nombre,
         work_order.contact_rut = client.rut,
         work_order.contact_phone = client.telefono,
         work_order.contact_email = client.email,
         work_order.billing_client_id = client.id,
         work_order.billing_name = client.nombre,
         work_order.billing_rut = client.rut,
         work_order.billing_type = client.tipo,
         work_order.billing_phone = client.telefono,
         work_order.billing_email = client.email,
         work_order.billing_address = client.direccion,
         work_order.billing_region = client.region,
         work_order.billing_comuna = client.comuna
     WHERE work_order.contact_client_id IS NULL
       AND work_order.billing_client_id IS NULL`,
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `UPDATE work_orders
     SET contact_client_id = NULL,
         contact_name = NULL,
         contact_rut = NULL,
         contact_phone = NULL,
         contact_email = NULL,
         billing_client_id = NULL,
         billing_name = NULL,
         billing_rut = NULL,
         billing_type = NULL,
         billing_phone = NULL,
         billing_email = NULL,
         billing_address = NULL,
         billing_region = NULL,
         billing_comuna = NULL`,
  );
}
