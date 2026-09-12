import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'vehicles',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      patente: {
        type: DataTypes.STRING(15),
        allowNull: false,
        unique: true,
      },
      marca: {
        type: DataTypes.STRING(80),
        allowNull: true,
      },
      modelo: {
        type: DataTypes.STRING(80),
        allowNull: true,
      },
      ano: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      color: {
        type: DataTypes.STRING(40),
        allowNull: true,
      },
      vin_chasis: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      motor: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      kilometraje: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      combustible: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      transmision: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      client_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'clients',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  );

  await queryInterface.addIndex('vehicles', ['patente'], { name: 'vehicles_patente_idx' });
  await queryInterface.addIndex('vehicles', ['client_id'], { name: 'vehicles_client_id_idx' });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('vehicles');
}
