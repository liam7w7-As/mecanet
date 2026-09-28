import { DataTypes } from 'sequelize';

import type { QueryInterface, Transaction } from 'sequelize';

const tableExists = async (queryInterface: QueryInterface, tableName: string): Promise<boolean> => {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
    if (!(await tableExists(queryInterface, 'company_settings'))) {
      await queryInterface.createTable(
        'company_settings',
        {
          id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
          razon_social: { type: DataTypes.STRING(180), allowNull: false },
          nombre_comercial: { type: DataTypes.STRING(120), allowNull: true },
          rut: { type: DataTypes.STRING(20), allowNull: true },
          giro: { type: DataTypes.STRING(255), allowNull: true },
          direccion: { type: DataTypes.STRING(255), allowNull: true },
          region: { type: DataTypes.STRING(100), allowNull: true },
          comuna: { type: DataTypes.STRING(100), allowNull: true },
          telefono: { type: DataTypes.STRING(30), allowNull: true },
          email: { type: DataTypes.STRING(120), allowNull: true },
          sitio_web: { type: DataTypes.STRING(200), allowNull: true },
          logo_storage_key: { type: DataTypes.STRING(200), allowNull: true },
          logo_mime_type: { type: DataTypes.STRING(60), allowNull: true },
          logo_size_bytes: { type: DataTypes.INTEGER, allowNull: true },
          logo_updated_at: { type: DataTypes.DATE, allowNull: true },
          updated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          },
          created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
          updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        },
        { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', transaction },
      );
    }

    // Fila única con los valores que ya estaban hardcodeados en la app, para
    // que el cambio sea invisible hasta que alguien edite la configuración.
    const [rows] = (await queryInterface.sequelize.query(
      'SELECT id FROM company_settings WHERE id = 1 LIMIT 1;',
      { transaction },
    )) as [{ id: number }[], unknown];

    if (rows.length === 0) {
      const now = new Date();
      await queryInterface.bulkInsert(
        'company_settings',
        [
          {
            id: 1,
            razon_social: 'UNITHOR SERVICIOS INTEGRALES SPA',
            nombre_comercial: 'UNITHOR',
            rut: '77.374.788-1',
            giro: 'Servicios de mantenimiento y reparación de vehículos',
            direccion: 'Arturo Fernández 2101',
            region: 'Tarapacá',
            comuna: 'Iquique',
            telefono: '+56 9 2375 7478',
            email: 'contacto@unithor.cl',
            sitio_web: 'unithor.cl',
            created_at: now,
            updated_at: now,
          },
        ],
        { transaction },
      );
    }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (!(await tableExists(queryInterface, 'company_settings'))) {
    return;
  }

  await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
    await queryInterface.dropTable('company_settings', { transaction });
  });
}
